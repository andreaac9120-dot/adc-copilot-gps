#!/usr/bin/env python3
"""Cartina delle linee (1.0.44): gemello Python di motore/cartina_modello.js.

Stessa logica, stesso risultato (tests/cartina.test.js confronta i due). Ogni modifica va fatta in entrambi.
Legge le tabelle del file .adcdb.json, non inventa niente: ciò che manca esce come «da studiare».

Uso:
    python3 -I strumenti/cartina_modello.py database.adcdb.json [config.json]            → modello della cartina
    python3 -I strumenti/cartina_modello.py database.adcdb.json [config.json] --linea ID  → riepilogo di una linea
    python3 -I strumenti/cartina_modello.py database.adcdb.json [config.json] --tutte     → modello + tutti i riepiloghi
"""
import json
import sys

VERSIONE_MODELLO = 1
TOLL = 0.0005
ORDINE_ST = {"V": 3, "R": 2, "I": 1, "N": 0}
RANGO_TIPO = {"stazione": 0, "scalo": 1, "bivio": 2, "PC": 3, "PM": 4, "fermata": 5, "deviatoio": 6, "punto": 7}
RANGO_POS = {"prima": 0, "presso": 1, "dopo": 2}
RANGO_SENSO = {"pari": 0, "dispari": 1, "entrambi": 2}
ORDINE_PAGINE = {"schema": 0, "fiancata_linea": 1, "principale": 2, "principale_sx": 3, "principale_dx": 4,
                 "sigle": 5, "sez46": 6, "sez420": 7, "altro": 8}


def vuoto(v):
    return v is None or (isinstance(v, str) and v.strip() == "")


def val(v):
    return None if vuoto(v) else v


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def tab(T, n):
    v = (T or {}).get(n)
    return v if isinstance(v, list) else []


def peggiore(stati):
    p = "V"
    for s in stati:
        if ORDINE_ST[s] < ORDINE_ST[p]:
            p = s
    return p


def per(T, n, k):
    m = {}
    for i, r in enumerate(tab(T, n)):
        v = r.get(k)
        if vuoto(v):
            continue
        m.setdefault(v, []).append((r, i))
    return m


def indice(T):
    return {
        "fonti": {r["fonte_id"]: r for r in tab(T, "fonti")},
        "linee": {r["linea_id"]: r for r in tab(T, "linee")},
        "localita": {r["loc_id"]: r for r in tab(T, "localita")},
        "geoV": {g["loc_id"]: g for g in tab(T, "geo") if g.get("st") == "V" and num(g.get("lat")) and num(g.get("lon"))},
        "punti": per(T, "punti_linea", "linea_id"), "puntiLoc": per(T, "punti_linea", "loc_id"),
        "fiancata": per(T, "fiancata", "linea_id"), "esercizio": per(T, "esercizio", "linea_id"),
        "indicatori": per(T, "indicatori", "loc_id"), "compat": per(T, "compatibilita", "linea_id"),
        "aff": per(T, "aff_linee", "aff_id"), "affLinea": per(T, "aff_linee", "linea_id"),
        "affiancamenti": {r["aff_id"]: r for r in tab(T, "affiancamenti")}, "sez46": per(T, "sez46_letta", "linea_id"),
        "pagine": per(T, "pagine_fl", "linea_id"), "disc": per(T, "discrepanze", "linea_id"),
    }


def src(I, fonte, pag):
    f = I["fonti"].get(fonte)
    return {"fonte": val(fonte), "fonte_breve": f["breve"] if f else val(fonte),
            "edizione": val(f.get("edizione")) if f else None, "pag": val(pag)}


def punti_ordinati(I, linea_id):
    return sorted([p for p, _ in I["punti"].get(linea_id, []) if num(p.get("km"))], key=lambda p: (p["km"], p["loc_id"]))


def estensione(punti):
    if not punti:
        return None
    return {"km_min": punti[0]["km"], "km_max": punti[-1]["km"], "loc_min": punti[0]["loc_id"], "loc_max": punti[-1]["loc_id"]}


def scoperti(intervalli, lo, hi):
    iv = sorted([(min(a, b), max(a, b)) for a, b in intervalli if num(a) and num(b)])
    out = []
    cur = lo
    for a, b in iv:
        if b <= cur + TOLL:
            continue
        if a > cur + TOLL:
            out.append([cur, min(a, hi)])
        if b > cur:
            cur = b
        if cur >= hi - TOLL:
            break
    if cur < hi - TOLL:
        out.append([cur, hi])
    return [x for x in out if x[1] - x[0] > TOLL]


def nome_loc(I, i):
    lo = I["localita"].get(i)
    return lo["nome"] if lo else i


# ---------- Cartina ----------
def costruisci(T, conf=None):
    conf = conf or {}
    I = indice(T)
    cl = conf.get("localita") or {}
    sempre, mai = set(cl.get("sempre") or []), set(cl.get("mai") or [])
    linee, senza = [], []
    linee_ord = sorted(tab(T, "linee"), key=lambda l: l["linea_id"])
    for l in linee_ord:
        ps = punti_ordinati(I, l["linea_id"])
        con = [(p, i) for i, p in enumerate(ps) if p["loc_id"] in I["geoV"]]
        base = {"linea_id": l["linea_id"], "nome": l["nome"], "nome_breve": l["nome_breve"], "compartimento": l["compartimento"],
                "st": l["st"], "senso_pari": val(l.get("senso_pari")), "n_punti": len(ps), "n_coord": len(con)}
        if len(con) < 2:
            base["motivo"] = ("nessuna località nel database" if not ps else
                              "nessuna località con coordinate V" if not con else "una sola località con coordinate V")
            senza.append(base)
            continue
        tratti = []
        for k in range(1, len(con)):
            (a, ia), (b, ib) = con[k - 1], con[k]
            manc = [p["loc_id"] for p in ps[ia + 1:ib]]
            tratti.append({"da": a["loc_id"], "a": b["loc_id"], "tipo": "tratteggiato" if manc else "pieno", "senza_coord": manc})
        seq = [p["loc_id"] for p, _ in con]
        lat = [I["geoV"][x]["lat"] for x in seq]
        lon = [I["geoV"][x]["lon"] for x in seq]
        base.update({"sequenza": seq, "tratti": tratti, "bbox": [min(lon), min(lat), max(lon), max(lat)], "scostamento": 0})
        linee.append(base)
    assegna_scostamenti(I, linee)
    collegamenti = giunzioni(I, linee_ord)

    localita = []
    for i, g in I["geoV"].items():
        pl = I["puntiLoc"].get(i, [])
        if not pl:
            continue
        lo = I["localita"].get(i) or {"nome": i, "tipo": "punto"}
        grado = len({p["linea_id"] for p, _ in pl})
        livello = 0 if (grado >= 3 or (lo["tipo"] == "stazione" and grado >= 2)) else 1 if lo["tipo"] == "stazione" else 2
        if i in sempre:
            livello = 0
        if i in mai:
            livello = 3
        localita.append({"loc_id": i, "nome": lo["nome"], "tipo": lo["tipo"], "lat": g["lat"], "lon": g["lon"], "grado": grado,
                         "livello": livello, "sempre": i in sempre, "linee": sorted(p["linea_id"] for p, _ in pl)})
    loc_ord = sorted(localita, key=lambda x: (x["livello"], -x["grado"], RANGO_TIPO.get(x["tipo"], 9), x["nome"], x["loc_id"]))
    for k, x in enumerate(loc_ord):
        x["priorita"] = k

    n_comp = {}
    for l in linee_ord:
        n_comp[l["compartimento"]] = n_comp.get(l["compartimento"], 0) + 1
    compartimenti = sorted([{"id": c, "n_linee": n} for c, n in n_comp.items()], key=lambda c: (-c["n_linee"], c["id"]))
    bb = None
    if linee:
        bb = [min(l["bbox"][0] for l in linee), min(l["bbox"][1] for l in linee), max(l["bbox"][2] for l in linee), max(l["bbox"][3] for l in linee)]
    return {
        "versione_modello": VERSIONE_MODELLO, "linee": linee, "senza_coordinate": senza, "collegamenti": collegamenti, "localita": loc_ord,
        "compartimenti": compartimenti, "bbox": bb,
        "conteggi": {"linee": len(linee_ord), "disegnate": len(linee), "senza_coordinate": len(senza), "localita_con_coordinate": len(localita),
                     "tratti_pieni": sum(1 for l in linee for t in l["tratti"] if t["tipo"] == "pieno"),
                     "tratti_tratteggiati": sum(1 for l in linee for t in l["tratti"] if t["tipo"] == "tratteggiato"),
                     "collegamenti": len(collegamenti)},
    }


def giunzioni(I, linee_ord):
    """Due linee che finiscono nello stesso punto senza coordinate V e lì si continuano: collegamento tratteggiato."""
    capi = {}
    for l in linee_ord:
        ps = punti_ordinati(I, l["linea_id"])
        if len(ps) < 2:
            continue
        for capo, verso in ((0, 1), (len(ps) - 1, -1)):
            i = ps[capo]["loc_id"]
            if i in I["geoV"]:
                continue
            k = capo + verso
            saltate = []
            while 0 <= k < len(ps) and ps[k]["loc_id"] not in I["geoV"]:
                saltate.append(ps[k]["loc_id"])
                k += verso
            capi.setdefault(i, []).append({"linea": l["linea_id"], "vicina": ps[k]["loc_id"] if 0 <= k < len(ps) else None, "saltate": saltate})
    out = []
    for via in sorted(capi):
        c = capi[via]
        if len(c) != 2 or c[0]["linea"] == c[1]["linea"] or len(I["puntiLoc"].get(via, [])) != 2:
            continue
        if not c[0]["vicina"] or not c[1]["vicina"]:
            continue
        a, b = sorted(c, key=lambda x: x["linea"])
        out.append({"via": via, "linee": [a["linea"], b["linea"]], "da": a["vicina"], "a": b["vicina"], "tipo": "tratteggiato",
                    "senza_coord": list(reversed(a["saltate"])) + [via] + b["saltate"]})
    return out


def assegna_scostamenti(I, linee):
    per_id = {l["linea_id"]: l for l in linee}
    vic = {l["linea_id"]: {} for l in linee}

    def lega(a, b, r):
        if a == b:
            return
        if b not in vic[a]:
            vic[a][b] = r
            vic[b][a] = r

    tratti = {}
    for l in linee:
        for t in l["tratti"]:
            k = t["da"] + "|" + t["a"] if t["da"] < t["a"] else t["a"] + "|" + t["da"]
            tratti.setdefault(k, []).append((l["linea_id"], 1 if t["da"] < t["a"] else -1))
    for k in sorted(tratti):
        v = tratti[k]
        for i in range(len(v)):
            for j in range(i + 1, len(v)):
                lega(v[i][0], v[j][0], v[i][1] * v[j][1])

    def dire(l):
        a, b = I["geoV"][l["sequenza"][0]], I["geoV"][l["sequenza"][-1]]
        return (b["lon"] - a["lon"], b["lat"] - a["lat"])

    for aff in sorted(I["aff"]):
        righe = sorted([r for r, _ in I["aff"][aff] if r["linea_id"] in per_id], key=lambda r: r["linea_id"])
        for a in righe:
            for b in righe:
                if a["linea_id"] >= b["linea_id"] or a["lato"] == b["lato"]:
                    continue
                da, db = dire(per_id[a["linea_id"]]), dire(per_id[b["linea_id"]])
                lega(a["linea_id"], b["linea_id"], 1 if da[0] * db[0] + da[1] * db[1] >= 0 else -1)
    fatto = {}
    for l in sorted(linee, key=lambda l: (-len(vic[l["linea_id"]]), l["linea_id"])):
        for c in [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]:
            if all(not (y in fatto and c == r * fatto[y]) for y, r in vic[l["linea_id"]].items()):
                fatto[l["linea_id"]] = c
                break
        fatto.setdefault(l["linea_id"], 0)
        l["scostamento"] = fatto[l["linea_id"]]


# ---------- Riepilogo ----------
VALORI_SENSO = {"crescente": "in senso pari le progressive crescono", "decrescente": "in senso pari le progressive calano"}


def sez_intestazione(I, L, ctx, T):
    f = I["fonti"].get(L.get("fonte"))
    campi = [
        ("nome", "Nome", val(L.get("nome"))), ("nome_breve", "Nome breve", val(L.get("nome_breve"))),
        ("compartimento", "Compartimento", val(L.get("compartimento"))), ("binari", "Binari", val(L.get("binari"))),
        ("senso_pari", "Senso pari", None if vuoto(L.get("senso_pari")) else VALORI_SENSO.get(L["senso_pari"], L["senso_pari"])),
        ("alimentazione", "Alimentazione", val(L.get("alimentazione"))),
        ("fonte", "Fonte FL", (f["breve"] + ("" if vuoto(f.get("edizione")) else " – " + f["edizione"])) if f else val(L.get("fonte"))),
        ("note", "Note", val(L.get("note"))),
    ]
    campi = [{"campo": c, "etichetta": e_, "valore": v} for c, e_, v in campi]
    mancano = len([c for c in campi if c["valore"] is None and c["campo"] != "note"])
    return {"stato": "parziale" if mancano else "popolata", "campi": campi, "src": src(I, L.get("fonte"), L.get("pag")), "st": L["st"]}


def sez_esercizio(I, L, ctx, T):
    righe = [{"senso": r["senso"], "km_da": r["km_da"], "km_a": r["km_a"], "sistema": r["sistema"], "testo": r["testo"],
              "riscontro": val(r.get("riscontro")), "src": src(I, r["fonte"], r.get("pag")), "st": r["st"]}
             for r, i in sorted(I["esercizio"].get(L["linea_id"], []), key=lambda x: (x[0]["km_da"], x[0]["km_a"], RANGO_SENSO.get(x[0]["senso"], 9), x[1]))]
    sc = scoperti([(r["km_da"], r["km_a"]) for r in righe], ctx["est"]["km_min"], ctx["est"]["km_max"]) if ctx["est"] else []
    return {"stato": "da_studiare" if not righe else "parziale" if sc else "popolata", "righe": righe, "scoperti": sc}


def sez_localita(I, L, ctx, T):
    righe = []
    for p in ctx["ordinePari"]:
        lo = I["localita"].get(p["loc_id"]) or {}
        righe.append({"loc_id": p["loc_id"], "nome": lo["nome"] if lo.get("nome") is not None else p["loc_id"], "tipo": val(lo.get("tipo")), "km": p["km"], "km_txt": p["km_txt"],
                      "posto": val(p.get("posto")), "nota": val(p.get("nota")), "coordinate": p["loc_id"] in I["geoV"],
                      "src": src(I, p["fonte"], p.get("pag")), "st": p["st"]})
    sp = L.get("senso_pari")
    ordine = "pari_decrescente" if sp == "decrescente" else "pari_crescente" if sp == "crescente" else "senso_pari_da_studiare"
    stato = "da_studiare" if not righe else "popolata" if all(r["coordinate"] for r in righe) and ordine != "senso_pari_da_studiare" else "parziale"
    return {"stato": stato, "ordine": ordine, "righe": righe}


def pulisci(r):
    o = dict(r)
    o.pop("i", None)
    return o


def sez_gdp(I, L, ctx, T):
    km_loc = {p["loc_id"]: p["km"] for p, _ in I["punti"].get(L["linea_id"], [])}
    tutte = [(r, i) for r, i in I["fiancata"].get(L["linea_id"], []) if r.get("gdp") is not None]
    sensi = []
    con_dato = senza_dato = 0
    for senso in ("pari", "dispari"):
        righe, senza_km = [], []
        for r, i in tutte:
            if r["senso"] != senso:
                continue
            da_loc = not num(r.get("km"))
            km = (km_loc.get(r.get("presso_loc")) if r.get("presso_loc") in km_loc else None) if da_loc else r["km"]
            riga = {"gdp": r["gdp"], "punto": r["punto"], "testo": r["testo"], "posizione": val(r.get("posizione")),
                    "presso_loc": val(r.get("presso_loc")), "km": km, "km_da_localita": da_loc,
                    "src": src(I, r["fonte"], r.get("pag")), "st": r["st"], "i": i}
            (senza_km if km is None else righe).append(riga)
        sp = L.get("senso_pari")
        cresc = None
        if sp in ("crescente", "decrescente"):
            cresc = (sp == "crescente") == (senso == "pari")
        out = {"senso": senso, "verso": None if cresc is None else "progressive_crescenti" if cresc else "progressive_decrescenti",
               "tratti": [], "senza_progressiva": [pulisci(r) for r in senza_km]}
        if cresc is None or not ctx["est"]:
            out["righe"] = [pulisci(r) for r in sorted(righe, key=lambda r: (r["km"], RANGO_POS.get(r["posizione"], 1), r["i"]))]
            out["motivo"] = ("senso pari della linea da studiare: i tratti non si possono comporre" if cresc is None
                             else "linea senza località: i tratti non si possono comporre")
            if righe:
                con_dato += 1
            else:
                senza_dato += 1
            sensi.append(out)
            continue
        s = 1 if cresc else -1
        ordr = sorted(righe, key=lambda r: (s * r["km"], RANGO_POS.get(r["posizione"], 1), r["i"]))
        gruppi = []
        for r in ordr:
            g = gruppi[-1] if gruppi else None
            if g and abs(g["km"] - r["km"]) <= TOLL and RANGO_POS.get(g["posizione"], 1) == RANGO_POS.get(r["posizione"], 1):
                g["righe"].append(r)
            else:
                gruppi.append({"km": r["km"], "posizione": r["posizione"], "righe": [r]})
        inizio = ctx["est"]["km_min"] if cresc else ctx["est"]["km_max"]
        fine = ctx["est"]["km_max"] if cresc else ctx["est"]["km_min"]

        def loc_a(km):
            for p in ctx["punti"]:
                if abs(p["km"] - km) <= TOLL:
                    return nome_loc(I, p["loc_id"])
            return None

        def nome_gruppo(g):
            r = g["righe"][0]
            return nome_loc(I, r["presso_loc"]) if r["presso_loc"] else (loc_a(g["km"]) or r["punto"])

        if not gruppi or abs(gruppi[0]["km"] - inizio) > TOLL:
            out["tratti"].append({"da_km": inizio, "a_km": gruppi[0]["km"] if gruppi else fine, "da_loc": loc_a(inizio),
                                  "a_loc": nome_gruppo(gruppi[0]) if gruppi else loc_a(fine), "posizione": None,
                                  "gdp": None, "conflitto": False, "valori": [], "righe": [], "st": "N"})
        for k, g in enumerate(gruppi):
            valori = list(dict.fromkeys(r["gdp"] for r in g["righe"]))
            nx = gruppi[k + 1] if k + 1 < len(gruppi) else None
            out["tratti"].append({"da_km": g["km"], "a_km": nx["km"] if nx else fine, "da_loc": nome_gruppo(g),
                                  "a_loc": nome_gruppo(nx) if nx else loc_a(fine), "posizione": g["posizione"],
                                  "gdp": valori[0] if len(valori) == 1 else None, "conflitto": len(valori) > 1, "valori": valori,
                                  "righe": [pulisci(r) for r in g["righe"]], "st": peggiore(r["st"] for r in g["righe"])})
        for t in out["tratti"]:
            if t["gdp"] is None:
                senza_dato += 1
            else:
                con_dato += 1
        sensi.append(out)
    return {"stato": "da_studiare" if not con_dato else "parziale" if senza_dato else "popolata", "sensi": sensi}


def sez_indicatori(I, L, ctx, T):
    gruppi = []
    for p in ctx["ordinePari"]:
        righe = []
        for r, i in sorted(I["indicatori"].get(p["loc_id"], []), key=lambda x: (RANGO_SENSO.get(x[0]["senso"], 9), x[1])):
            vl = val(r.get("verso_linea"))
            ln = I["linee"].get(vl) if vl else None
            righe.append({"senso": r["senso"], "segnale": r["segnale"], "cifra": r["cifra"], "verso_linea": vl if ln else None,
                          "verso_nome": ln["nome_breve"] if ln else None, "dove": r["dove"], "nota": val(r.get("nota")),
                          "src": src(I, r["fonte"], r.get("pag")), "st": r["st"]})
        if righe:
            gruppi.append({"loc_id": p["loc_id"], "nome": nome_loc(I, p["loc_id"]), "km_txt": p["km_txt"], "righe": righe})
    return {"stato": "popolata" if gruppi else "da_studiare", "localita": gruppi}


def esito_compat(r):
    return "esclusa" if vuoto(r.get("rango_max")) else "limitazione" if num(r.get("vmax_nota")) else "ammessa"


def sez_compat(I, L, ctx, T):
    righe = I["compat"].get(L["linea_id"], [])

    def chiave(r):
        return (r["km_da"], r["km_a"], r["tratto_de"])

    visti = {}
    for r, _ in righe:
        visti.setdefault(chiave(r), {"km_da": r["km_da"], "km_a": r["km_a"], "tratto_de": r["tratto_de"]})
    tratti = sorted(visti.values(), key=lambda t: (t["km_da"], t["km_a"], t["tratto_de"]))
    loco = []
    for l in sorted(tab(T, "loco"), key=lambda l: l["loco"]):
        mie = [r for r, _ in righe if r["colonna_de10"] == l["colonna_de10"]]
        celle = []
        for t in tratti:
            qui = [{"esito": esito_compat(r), "simbolo": r["simbolo"], "rango_max": val(r.get("rango_max")),
                    "vmax_nota": r["vmax_nota"] if num(r.get("vmax_nota")) else None, "nota": val(r.get("nota")),
                    "src": src(I, r["fonte"], r.get("pag")), "st": r["st"]} for r in mie if chiave(r) == chiave(t)]
            esito = ("da_studiare" if not qui else qui[0]["esito"] if len({q["esito"] for q in qui}) == 1 else "conflitto")
            celle.append({"esito": esito, "righe": qui})
        sc = scoperti([(r["km_da"], r["km_a"]) for r in mie], ctx["est"]["km_min"], ctx["est"]["km_max"]) if ctx["est"] else []
        loco.append({"loco": l["loco"], "colonna_de10": l["colonna_de10"], "rango_dpc": val(l.get("rango_dpc")),
                     "vmax": l["vmax"] if num(l.get("vmax")) else None,
                     "stato": "da_studiare" if not mie else "parziale" if sc else "popolata", "celle": celle, "scoperti": sc,
                     "src": src(I, l["fonte"], l.get("pag")), "st": l["st"]})
    stati = [l["stato"] for l in loco]
    stato = "da_studiare" if not righe or not loco else "popolata" if all(s == "popolata" for s in stati) else "parziale"
    return {"stato": stato, "tratti": tratti, "loco": loco}


def copertura(intervalli, a, b):
    if not num(a) or not num(b):
        return "progressive_non_trascritte"
    lo, hi = min(a, b), max(a, b)
    sc = scoperti(intervalli, lo, hi)
    if not sc:
        return "coperto"
    buco = 0
    for x in sc:
        buco = buco + x[1] - x[0]
    return "non_coperto" if buco >= hi - lo - TOLL else "parziale"


def sez_affiancate(I, L, ctx, T):
    letti = [{"km_da": r["km_da"], "km_a": r["km_a"], "src": src(I, r["fonte"], r.get("pag")), "st": r["st"]}
             for r, i in sorted(I["sez46"].get(L["linea_id"], []), key=lambda x: (x[0]["km_da"], x[0]["km_a"], x[1]))]
    iv = [(r["km_da"], r["km_a"]) for r in letti]
    gruppi = []
    for r, _ in sorted(I["affLinea"].get(L["linea_id"], []), key=lambda x: x[0]["aff_id"]):
        a = I["affiancamenti"].get(r["aff_id"]) or {}
        altre = []
        for x in sorted([x for x, _ in I["aff"].get(r["aff_id"], []) if x["linea_id"] != L["linea_id"]],
                        key=lambda x: (1 if x["lato"] == r["lato"] else 0, x["linea_id"])):
            altre.append({"linea_id": x["linea_id"], "nome_breve": I["linee"][x["linea_id"]]["nome_breve"] if x["linea_id"] in I["linee"] else x["linea_id"],
                          "tratto": x["tratto"], "km_da": x["km_da"] if num(x.get("km_da")) else None, "km_a": x["km_a"] if num(x.get("km_a")) else None,
                          "lato": x["lato"], "relazione": "stesso_percorso" if x["lato"] == r["lato"] else "affiancata"})
        gruppi.append({"aff_id": r["aff_id"], "descrizione": val(a.get("descrizione")), "categoria": val(a.get("categoria")),
                       "condizioni": val(a.get("condizioni")), "src": src(I, a["fonte"], a.get("pag")) if a.get("fonte") else None,
                       "st": a.get("st") or "N", "tratto": r["tratto"],
                       "km_da": r["km_da"] if num(r.get("km_da")) else None, "km_a": r["km_a"] if num(r.get("km_a")) else None,
                       "lato": r["lato"], "sez46": copertura(iv, r.get("km_da"), r.get("km_a")), "altre": altre})
    sc = scoperti(iv, ctx["est"]["km_min"], ctx["est"]["km_max"]) if ctx["est"] else None
    coperta = sc is not None and not sc and len(letti) > 0
    if gruppi:
        stato = "popolata" if coperta else "parziale"
    else:
        stato = "popolata" if coperta else "parziale" if letti else "da_studiare"
    return {"stato": stato, "gruppi": gruppi, "sez46_letta": letti, "sez46_scoperti": sc or [], "nessuna_affiancata": (not gruppi) and coperta}


def sez_utenze(I, L, ctx, T):
    pos_loc = {p["loc_id"]: k for k, p in enumerate(ctx["ordinePari"])}
    righe = []
    for i, r in enumerate(tab(T, "utenze")):
        lin, loc, comp = val(r.get("linea_id")), val(r.get("loc_id")), val(r.get("compartimento"))
        ambito = None
        if loc and loc in pos_loc and (lin is None or lin == L["linea_id"]):
            ambito, ordk = "localita", (0, pos_loc[loc], 0, i)
        elif not loc and lin == L["linea_id"]:
            ambito = "tratto" if num(r.get("km_da")) else "linea"
            ordk = (1, 0, r["km_da"] if num(r.get("km_da")) else -1e9, i)
        elif not loc and lin is None and comp is not None and comp == L.get("compartimento"):
            ambito, ordk = "compartimento", (2, 0, 0, i)
        if not ambito:
            continue
        righe.append((ordk, {"ruolo": r["ruolo"], "chi": r["chi"], "ambito": ambito, "loc_id": loc, "loc_nome": nome_loc(I, loc) if loc else None,
                             "km_da": r["km_da"] if num(r.get("km_da")) else None, "km_a": r["km_a"] if num(r.get("km_a")) else None,
                             "compartimento": comp, "gsmr": val(r.get("gsmr")), "fs": val(r.get("fs")), "altro": val(r.get("altro")),
                             "src": src(I, r["fonte"], r.get("pag")), "st": r["st"]}))
    out = [x[1] for x in sorted(righe, key=lambda x: x[0])]
    return {"stato": "popolata" if out else "da_studiare", "righe": out}


def sez_pagine(I, L, ctx, T):
    righe = []
    for r, i in sorted(I["pagine"].get(L["linea_id"], []), key=lambda x: (ORDINE_PAGINE.get(x[0]["tipo"], 9), x[0]["fonte"],
                                                                          RANGO_SENSO.get(x[0].get("senso"), 9),
                                                                          x[0]["pag_pdf"] if num(x[0].get("pag_pdf")) else 1e9, x[1])):
        righe.append({"fonte": r["fonte"], "fonte_breve": src(I, r["fonte"], None)["fonte_breve"], "pag": r["pag"],
                      "pag_pdf": r["pag_pdf"] if num(r.get("pag_pdf")) else None, "tipo": r["tipo"], "senso": val(r.get("senso")),
                      "km_da": r["km_da"] if num(r.get("km_da")) else None, "km_a": r["km_a"] if num(r.get("km_a")) else None,
                      "img": val(r.get("img"))})
    return {"stato": "popolata" if righe else "da_studiare", "righe": righe}


def sez_discrepanze(I, L, ctx, T):
    righe = [{"disc_id": r["disc_id"], "testo": r["testo"], "fonti": r["fonti"]}
             for r, _ in sorted([x for x in I["disc"].get(L["linea_id"], []) if x[0]["stato"] == "aperta"], key=lambda x: x[0]["disc_id"])]
    return {"stato": "avviso" if righe else "nessuna", "righe": righe}


SEZIONI = [
    ("intestazione", "Intestazione", sez_intestazione),
    ("esercizio", "Sistema di esercizio", sez_esercizio),
    ("localita", "Località", sez_localita),
    ("gdp", "Grado di prestazione", sez_gdp),
    ("indicatori", "Indicatori di direzione", sez_indicatori),
    ("compatibilita", "Circolabilità delle locomotive", sez_compat),
    ("affiancate", "Linee affiancate (Sez. 4.6)", sez_affiancate),
    ("utenze", "Utenze telefoniche", sez_utenze),
    ("pagine_fl", "Pagine FL in immagine", sez_pagine),
    ("discrepanze", "Discrepanze aperte", sez_discrepanze),
]


def riepilogo(T, linea_id, I=None):
    I = I or indice(T)
    L = I["linee"].get(linea_id)
    if not L:
        return None
    punti = punti_ordinati(I, linea_id)
    ctx = {"punti": punti, "est": estensione(punti), "ordinePari": list(reversed(punti)) if L.get("senso_pari") == "decrescente" else punti}
    sez = []
    for sid, titolo, fn in SEZIONI:
        d = {"id": sid, "titolo": titolo}
        d.update(fn(I, L, ctx, T))
        sez.append(d)
    return {"versione_modello": VERSIONE_MODELLO, "linea_id": linea_id, "nome": L["nome"], "nome_breve": L["nome_breve"],
            "compartimento": L["compartimento"], "st": L["st"], "estensione": ctx["est"], "sezioni": sez}


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    d = json.load(open(argv[1], encoding="utf-8"))
    T = d.get("tabelle", d)
    resto = argv[2:]
    conf = {}
    if resto and not resto[0].startswith("--"):
        conf = json.load(open(resto.pop(0), encoding="utf-8"))
    if resto and resto[0] == "--linea":
        out = riepilogo(T, resto[1])
    elif resto and resto[0] == "--tutte":
        I = indice(T)
        out = {"modello": costruisci(T, conf), "riepiloghi": {l["linea_id"]: riepilogo(T, l["linea_id"], I) for l in tab(T, "linee")}}
    else:
        out = costruisci(T, conf)
    sys.stdout.write(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
