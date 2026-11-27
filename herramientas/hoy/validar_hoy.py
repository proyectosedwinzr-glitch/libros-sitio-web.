# -*- coding: utf-8 -*-
"""Verificador independiente de «La historia del día» (no importa el generador).

    python3 -I verificar_diciembre.py hoy_2026-12.json            # 0 fallos esperados
    python3 -I verificar_diciembre.py hoy_2026-12.json --prueba   # cada defecto plantado tiene que saltar

Solo usa la biblioteca estándar y la lista de vetadas (datos).
"""
import copy, datetime, json, sys, unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from vetadas import VULGARES, MALSONANTES

D8 = [(0, 1), (1, 0), (1, 1), (-1, 1), (0, -1), (-1, 0), (-1, -1), (1, -1)]
NIVEL1 = {(0, 1), (1, 0), (1, 1)}


def norm(s):
    s = s.upper().replace("Ñ", "\x00")
    s = "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")
    s = s.replace("\x00", "Ñ")
    return "".join(ch for ch in s if "A" <= ch <= "Z" or ch == "Ñ")


def tokens(texto):
    return {norm(t) for t in texto.replace("—", " ").replace("-", " ").split() if norm(t)}


def familia(a, b):
    cp = 0
    while cp < min(len(a), len(b)) and a[cp] == b[cp]:
        cp += 1
    return a.startswith(b) or b.startswith(a) or (cp >= 5 and cp >= min(len(a), len(b)) - 3)


def ocurrencias(g, w):
    n, out = len(g), []
    for r in range(n):
        for c in range(n):
            for d in D8:
                cs = [(r + d[0] * i, c + d[1] * i) for i in range(len(w))]
                if all(0 <= a < n and 0 <= b < n for a, b in cs) and "".join(g[a][b] for a, b in cs) == w:
                    out.append((cs, d))
    return out


def caminos(g, w, tope=3):
    n, cuenta = len(g), 0
    def dfs(r, c, i, vis):
        nonlocal cuenta
        if cuenta >= tope: return
        if i == len(w) - 1:
            cuenta += 1; return
        for dr, dc in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            a, b = r + dr, c + dc
            if 0 <= a < n and 0 <= b < n and (a, b) not in vis and g[a][b] == w[i + 1]:
                vis.add((a, b)); dfs(a, b, i + 1, vis); vis.discard((a, b))
    for r in range(n):
        for c in range(n):
            if g[r][c] == w[0]:
                dfs(r, c, 0, {(r, c)})
    return cuenta


def verificar(datos):
    fallos = []
    F = lambda h, m: fallos.append(f"{h.get('fecha', '?')}: {m}")
    hs = datos.get("historias", [])
    fechas = [h.get("fecha") for h in hs]
    if len(set(fechas)) != len(fechas):
        fallos.append("fechas repetidas")
    ano, mes = map(int, datos["mes"].split("-"))
    esperadas = [datetime.date(ano, mes, d).isoformat() for d in range(1, 32)
                 if (datetime.date(ano, mes, 1) + datetime.timedelta(days=d - 1)).month == mes]
    if sorted(set(fechas)) != esperadas:
        fallos.append("faltan días o sobran fechas del mes")
    vistas = {}
    for h in hs:
        try:
            g = h["cuadricula"]["filas"]; n = h["cuadricula"]["lado"]
            relato, frase, mensaje = h["relato"], h["frase"], h["mensaje"]
            lista = h["pagina"]["lista"]
        except KeyError as e:
            F(h, f"falta el campo {e}"); continue
        fecha = datetime.date.fromisoformat(h["fecha"])
        nivel = 1 if fecha.weekday() <= 2 else 2
        if h.get("tipo") != f"nivel{nivel}": F(h, f"tipo {h.get('tipo')} ≠ nivel{nivel}")
        if h.get("dia_mes") != fecha.strftime("%m-%d"): F(h, "dia_mes")
        if len(g) != n or any(len(f) != n for f in g): F(h, "cuadrícula no cuadrada")
        if any(not (("A" <= ch <= "Z") or ch == "Ñ") or len(ch) != 1 for f in g for ch in f): F(h, "casilla no válida")
        if n not in (9, 10): F(h, f"lado {n}")
        npal = len([w for w in relato.split() if any(ch.isalnum() for ch in w)])
        if not 50 <= npal <= 70: F(h, f"relato de {npal} palabras")
        if len(h.get("fuentes", [])) < 2: F(h, "menos de dos fuentes")
        # frase
        fr = norm(frase)
        if frase not in relato: F(h, "frase no literal en el relato")
        if not 15 <= len(fr) <= 25: F(h, f"frase de {len(fr)} letras")
        rec = [tuple(x) for x in h["frase_recorrido"]]
        if len(rec) != len(fr) or len(set(rec)) != len(rec): F(h, "recorrido de la frase: largo o casillas repetidas")
        elif "".join(g[a][b] for a, b in rec) != fr: F(h, "el recorrido no deletrea la frase")
        elif any(abs(a - c) + abs(b - d) != 1 for (a, b), (c, d) in zip(rec, rec[1:])): F(h, "recorrido no contiguo")
        k = caminos(g, fr)
        if k != 1: F(h, f"la frase tiene {k} recorridos")
        # lista
        tok = tokens(relato)
        cubiertas = set(rec)
        reves = 0
        if not 4 <= len(lista) <= 6: F(h, f"lista de {len(lista)} palabras")
        for w in lista:
            if w not in tok: F(h, f"{w} no está en el relato")
            if len(w) < 6: F(h, f"{w} tiene menos de 6 letras")
            if w in fr: F(h, f"{w} está dentro de la frase")
            for u, otra in vistas.items():
                if otra != h["fecha"] and familia(u, w):
                    F(h, f"{w} repite o es familia de {u} ({otra})")
            oc = ocurrencias(g, w)
            if len(oc) != 1:
                F(h, f"{w} aparece {len(oc)} veces"); continue
            cs, d = oc[0]
            if nivel == 1 and d not in NIVEL1: F(h, f"{w} va en una dirección prohibida en el nivel 1")
            if d[1] < 0 or (d[1] == 0 and d[0] < 0): reves += 1
            cubiertas |= set(cs)
            for u in lista:
                if u != w and u in w: F(h, f"{u} está dentro de {w}")
        for w in lista:
            vistas.setdefault(w, h["fecha"])
        if nivel == 2 and reves < 1: F(h, "nivel 2 sin ninguna palabra al revés")
        # final
        libres = [(r, c) for c in range(n) for r in range(n) if (r, c) not in cubiertas]
        leido = "".join(g[r][c] for r, c in libres)
        if leido != norm(mensaje): F(h, "las letras sobrantes no dan el final")
        ranuras = h["pagina_cuadricula"]["ranuras"]
        if ranuras != [len(norm(w)) for w in mensaje.split() if norm(w)]: F(h, "ranuras del final")
        if h.get("mensaje_letras") != len(norm(mensaje)): F(h, "mensaje_letras")
        for w in lista:
            if w in leido or w[::-1] in leido: F(h, f"{w} también sale en el final")
        # colocadas coherentes con la cuadrícula
        col = h["cuadricula"]["colocadas"]
        if sorted(x[1] for x in col if x[0] != "FRASE") != sorted(lista): F(h, "colocadas ≠ lista")
        for ident, w, cs, d, paso in col:
            if "".join(g[a][b] for a, b in cs) != w: F(h, f"colocada {ident} no coincide con la cuadrícula")
        # vetadas
        tramos = [rec] + [ocurrencias(g, w)[0][0] for w in lista if len(ocurrencias(g, w)) == 1]
        i = 0
        for L in ranuras:
            tramos.append(libres[i:i + L]); i += L
        def dentro(cs):
            for t in tramos:
                for j in range(len(t) - len(cs) + 1):
                    if t[j:j + len(cs)] in (cs, cs[::-1]):
                        return True
            return False
        for v in VULGARES:
            if ocurrencias(g, norm(v)): F(h, f"vetada {v}")
        for v in MALSONANTES:
            for cs, d in ocurrencias(g, norm(v)):
                if not dentro(cs): F(h, f"malsonante suelta {v}")
        # página
        vis = h["pagina"]["frase_visible"]
        if "".join(vis).replace("_", "") == "" or len("".join(vis)) != len(fr) or any(
                a != "_" and a != b for a, b in zip("".join(vis), fr)):
            F(h, "frase_visible no cuadra con la frase")
        else:
            nvis = sum(1 for a in "".join(vis) if a != "_")
            if nivel == 1 and nvis <= len(fr) / 2: F(h, "nivel 1 con la mitad o menos de la frase a la vista")
            if nivel == 2 and not (len(fr) / 4 <= nvis <= len(fr) / 2.5): F(h, "nivel 2: no se ve un tercio de la frase")
        if h["pagina"]["lista"] != sorted(lista): F(h, "lista sin ordenar")
    return fallos


def plantar(datos):
    """Cada defecto devuelve una copia con un fallo que el verificador tiene que ver."""
    defectos = {}
    d = copy.deepcopy(datos); h = d["historias"][4]
    w = h["pagina"]["lista"][0]; cs = next(x[2] for x in h["cuadricula"]["colocadas"] if x[1] == w)
    a, b = cs[1]; h["cuadricula"]["filas"][a][b] = "Q" if h["cuadricula"]["filas"][a][b] != "Q" else "X"
    defectos["letra cambiada en una palabra"] = d
    d = copy.deepcopy(datos); h = d["historias"][9]
    r = h["frase_recorrido"]; r[3], r[4] = r[4], r[3]
    defectos["recorrido de la frase roto"] = d
    d = copy.deepcopy(datos); h = d["historias"][14]
    h["mensaje"] = h["mensaje"][:-2] + h["mensaje"][-1]
    defectos["final con una letra de menos"] = d
    d = copy.deepcopy(datos); d["historias"][20]["fecha"] = d["historias"][19]["fecha"]
    defectos["fecha repetida"] = d
    d = copy.deepcopy(datos); h = d["historias"][2]; h["tipo"] = "nivel1"
    defectos["nivel mal puesto"] = d
    d = copy.deepcopy(datos); h = d["historias"][7]
    h["relato"] = h["relato"].replace(h["frase"], h["frase"].replace(" ", "  ", 1))
    defectos["frase ya no literal"] = d
    d = copy.deepcopy(datos); h = d["historias"][11]
    g = h["cuadricula"]["filas"]; n = len(g)
    cub = set(tuple(x) for x in h["frase_recorrido"])
    for x in h["cuadricula"]["colocadas"]:
        cub |= {tuple(c) for c in x[2]}
    libres = [(r, c) for c in range(n) for r in range(n) if (r, c) not in cub]
    for i in range(len(libres) - 3):
        trozo = libres[i:i + 4]
        if all(trozo[j][1] == trozo[0][1] and trozo[j][0] == trozo[0][0] + j for j in range(4)):
            for (r, c), ch in zip(trozo, "PUTO"):
                g[r][c] = ch
            letras = "".join(g[r][c] for r, c in libres)
            out, p = [], 0
            for L in h["pagina_cuadricula"]["ranuras"]:
                out.append(letras[p:p + L]); p += L
            h["mensaje"] = " ".join(out)
            break
    defectos["vetada plantada en el final"] = d
    d = copy.deepcopy(datos); w = d["historias"][1]["pagina"]["lista"][0]
    d["historias"][2]["pagina"]["lista"] = sorted(d["historias"][2]["pagina"]["lista"] + [w])
    defectos["palabra repetida en el mes"] = d
    d = copy.deepcopy(datos); d["historias"][3]["pagina"]["lista"] = sorted(d["historias"][3]["pagina"]["lista"] + ["SEPARARON"])
    defectos["familia repetida en el mes"] = d
    return defectos


ESPERADO = {
    "letra cambiada en una palabra": "aparece 0 veces",
    "recorrido de la frase roto": "no deletrea la frase",
    "final con una letra de menos": "no dan el final",
    "fecha repetida": "fechas repetidas",
    "nivel mal puesto": "tipo nivel1",
    "frase ya no literal": "frase no literal",
    "vetada plantada en el final": "vetada PUTO",
    "palabra repetida en el mes": "repite o es familia",
    "familia repetida en el mes": "SEPARARON repite o es familia",
}


def main():
    ruta = Path(sys.argv[1])
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    fallos = verificar(datos)
    print(f"{ruta.name}: {len(datos['historias'])} historias, {len(fallos)} fallos")
    for f in fallos:
        print("  ·", f)
    if "--prueba" in sys.argv:
        ok = 0
        for nombre, d in plantar(datos).items():
            fx = verificar(d)
            clave = ESPERADO[nombre]
            salta = any(clave in f for f in fx)
            ok += salta
            print(f"  defecto «{nombre}»: {'detectado' if salta else 'NO DETECTADO'}" + (f" → {next((f for f in fx if ESPERADO[nombre] in f), fx[0] if fx else '')}"))
        print(f"Defectos plantados detectados: {ok}/{len(plantar(datos))}")
        if ok != len(plantar(datos)):
            sys.exit(2)
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
