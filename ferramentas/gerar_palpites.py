"""Gera dados/palpites.txt: as palavras de 5 letras que o jogo aceita como palpite.

Fonte: o dicionário pt_BR do VERO, o corretor ortográfico do LibreOffice
(https://github.com/LibreOffice/dictionaries/tree/master/pt_BR). O script aplica
as regras de sufixo e prefixo do Hunspell para gerar plurais e conjugações,
tira os acentos e junta com as palavras secretas de script/palavras.js e com
listas extras opcionais (um arquivo .txt com uma palavra por linha).

Uso, a partir da pasta do projeto:
    python3 ferramentas/gerar_palpites.py pt_BR.aff pt_BR.dic dados/palpites.txt [extras.txt ...]
"""
import re
import sys
import unicodedata

aff_path, dic_path, saida = sys.argv[1], sys.argv[2], sys.argv[3]
extras = sys.argv[4:]

sfx, pfx = {}, {}
forbidden = None
for linha in open(aff_path, encoding="utf-8", errors="replace"):
    partes = linha.split()
    if not partes:
        continue
    if partes[0] == "FORBIDDENWORD" and len(partes) > 1:
        forbidden = partes[1]
    if partes[0] in ("SFX", "PFX") and len(partes) >= 5:
        tipo, flag, strip, add, cond = partes[:5]
        add = add.split("/")[0]
        strip = "" if strip == "0" else strip
        add = "" if add == "0" else add
        cond = "." if cond == "." else cond
        alvo = sfx if tipo == "SFX" else pfx
        padrao = re.compile((cond + "$") if tipo == "SFX" else ("^" + cond))
        alvo.setdefault(flag, []).append((strip, add, padrao))


def sem_acento(p):
    return "".join(c for c in unicodedata.normalize("NFD", p) if unicodedata.category(c) != "Mn").lower()


cinco = set()
with open(dic_path, encoding="utf-8", errors="replace") as f:
    next(f)  # primeira linha = quantidade de entradas
    for linha in f:
        linha = linha.strip().lstrip("﻿")
        if not linha:
            continue
        palavra, _, flags = linha.partition("/")
        flags = flags.split()[0] if flags else ""
        if forbidden and forbidden in flags:
            continue
        if not palavra.isalpha() or palavra != palavra.lower():
            continue  # nomes próprios, siglas, palavras compostas

        formas = {palavra}
        for fl in flags:
            for strip, add, padrao in sfx.get(fl, []):
                if padrao.search(palavra) and palavra.endswith(strip):
                    formas.add(palavra[: len(palavra) - len(strip)] + add)
        for fl in flags:
            for strip, add, padrao in pfx.get(fl, []):
                for base in list(formas):
                    if padrao.search(base) and base.startswith(strip):
                        formas.add(add + base[len(strip):])

        for forma in formas:
            s = sem_acento(forma)
            if re.fullmatch(r"[a-z]{5}", s):
                cinco.add(s)

# Palavras secretas do jogo: todas precisam ser aceitas como palpite
secretas = re.findall(r'"([a-z]{5})"', open("script/palavras.js", encoding="utf-8").read())
cinco.update(secretas)

for caminho in extras:
    for p in open(caminho, encoding="utf-8").read().split():
        s = sem_acento(p)
        if len(p) == 5 and p == p.lower() and re.fullmatch(r"[a-z]{5}", s):
            cinco.add(s)

with open(saida, "w", encoding="utf-8") as out:
    out.write("\n".join(sorted(cinco)) + "\n")
print(len(cinco), "palavras de 5 letras")
