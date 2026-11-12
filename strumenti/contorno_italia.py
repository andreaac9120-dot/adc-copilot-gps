#!/usr/bin/env python3
"""Contorno semplificato dell'Italia (e dei Paesi confinanti) per lo sfondo della cartina.

Fonte: Natural Earth, «Admin 0 – Countries» 1:10m (pubblico dominio, https://www.naturalearthdata.com/).
Uso (una volta, con il file scaricato da
https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson):

    python3 -I strumenti/contorno_italia.py ne_10m_admin_0_countries.geojson cartina/contorno_italia.json

Semplificazione Douglas-Peucker (tolleranza in gradi), coordinate arrotondate a 3 decimali (circa 100 m).
È solo uno sfondo di orientamento: non entra in nessun calcolo e non dice nulla sulle linee.
"""
import json, sys

PAESI = {"ITA": 0.004, "SMR": 0.002, "VAT": 0.0005, "CHE": 0.01, "FRA": 0.015, "AUT": 0.012, "SVN": 0.01,
         "MCO": 0.001, "HRV": 0.015}
BBOX = (4.5, 35.0, 20.0, 48.5)   # lon min, lat min, lon max, lat max: solo i poligoni che toccano questa zona
MIN_PUNTI = 4


def dp(punti, tol):
    if len(punti) < 3:
        return punti
    keep = [False] * len(punti)
    keep[0] = keep[-1] = True
    pila = [(0, len(punti) - 1)]
    while pila:
        a, b = pila.pop()
        (x1, y1), (x2, y2) = punti[a], punti[b]
        dx, dy = x2 - x1, y2 - y1
        n = (dx * dx + dy * dy) ** 0.5
        imax, dmax = -1, 0.0
        for i in range(a + 1, b):
            x, y = punti[i]
            d = abs(dy * (x - x1) - dx * (y - y1)) / n if n else ((x - x1) ** 2 + (y - y1) ** 2) ** 0.5
            if d > dmax:
                imax, dmax = i, d
        if dmax > tol:
            keep[imax] = True
            pila += [(a, imax), (imax, b)]
    return [p for p, k in zip(punti, keep) if k]


def tocca(anello):
    xs = [p[0] for p in anello]; ys = [p[1] for p in anello]
    return not (max(xs) < BBOX[0] or min(xs) > BBOX[2] or max(ys) < BBOX[1] or min(ys) > BBOX[3])


def main(src, dst):
    g = json.load(open(src, encoding="utf-8"))
    out = []
    for f in g["features"]:
        iso = f["properties"].get("ADM0_A3")
        if iso not in PAESI:
            continue
        geo = f["geometry"]
        poligoni = geo["coordinates"] if geo["type"] == "MultiPolygon" else [geo["coordinates"]]
        anelli = []
        for pol in poligoni:
            if not tocca(pol[0]):
                continue
            for anello in pol:
                s = dp(anello, PAESI[iso])
                s = [[round(x, 3), round(y, 3)] for x, y in s]
                if len(s) >= MIN_PUNTI:
                    anelli.append(s)
        out.append({"iso": iso, "anelli": anelli})
    out.sort(key=lambda p: (p["iso"] != "ITA", p["iso"]))
    json.dump({"fonte": "Natural Earth 1:10m Admin 0 Countries, pubblico dominio (semplificato)", "paesi": out},
              open(dst, "w", encoding="utf-8"), separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
