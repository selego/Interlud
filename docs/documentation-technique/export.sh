#!/usr/bin/env bash
# Assemble les parties de la documentation technique en un seul document Word (et PDF via LibreOffice).
# Usage : ./docs/documentation-technique/export.sh          → docs/documentation-technique/build/EVALUD-documentation-technique.{docx,pdf}
#         ./docs/documentation-technique/export.sh 03       → export d'une seule partie (préfixe du fichier)
set -euo pipefail
cd "$(dirname "$0")"

command -v pandoc >/dev/null || { echo "pandoc manquant : brew install pandoc" >&2; exit 1; }

PARTS=(01-architecture-et-demarrage.md 02-api.md 03-excel-sharepoint.md 04-frontend.md 05-domaine-metier.md)
NAME="EVALUD-documentation-technique"
if [[ "${1:-}" != "" ]]; then
  PARTS=("$1"*.md)
  NAME="EVALUD-$(basename "${PARTS[0]}" .md)"
fi

mkdir -p build
MERGED="build/$NAME.md"
VERSION=$(grep -m1 -o 'Version [0-9.]*\*\* — [^"]*' ../../DOCUMENTATION.md | sed 's/\*\*//' || true)

{
  echo "---"
  echo "title: \"Documentation technique — EVALUD / InTerLUD+\""
  echo "subtitle: \"${VERSION}\""
  echo "lang: fr"
  echo "---"
  echo
} > "$MERGED.header"

{
  for f in "${PARTS[@]}"; do
    # - retire les lignes de navigation (en-tête "> Partie de…" et pied "[Sommaire]…") et le sommaire local
    # - liens croisés 0X-fichier.md#ancre → #ancre (même document) ; 0X-fichier.md → #titre
    # - liens relatifs vers le code (../…) → texte simple en police fixe
    PART="${f%.md}" perl -ne '
      next if /^> Partie de la \[documentation technique/ || /\[Sommaire\]\(\.\.\/\.\.\/DOCUMENTATION\.md\)/;
      s/\]\(0\d-[^)#]*(#[^)]*)\)/]($1)/g;
      s/\]\((0\d-[^)#]*)\.md\)/](#part-$1)/g;
      s/\[([^\]]+)\]\(\.\.\/[^)]*\)/`$1`/g;
      s/^# (.*)$/# $1 {#part-$ENV{PART}}/ if $. == 1;
      print;
    ' "$f" | awk 'BEGIN{skip=0} /^\*\*Sommaire\*\*$/{skip=1; next} skip && /^---$/{skip=0; next} !skip'
    echo
    echo
  done
} > "$MERGED.body"

# Sommaire généré ici (un champ TOC Word ne serait pas rempli par LibreOffice en conversion PDF) :
# titres de niveau 1 et 2 hors blocs de code, ancres au format GitHub (= pandoc gfm_auto_identifiers)
{
  cat "$MERGED.header"
  echo "## Sommaire"
  echo
  perl -CSD -ne '
    $in = !$in if /^```/; next if $in;
    if (/^(#{1,2}) (.*?)(?: \{#([^}]*)\})?$/) {
      my ($lvl, $txt, $id) = (length $1, $2, $3);
      (my $t = $txt) =~ s/`//g;
      unless ($id) { $id = lc $t; $id =~ s/\[([^\]]*)\]\([^)]*\)/$1/g; $id =~ s/[^\p{L}\p{N} _-]//g; $id =~ s/ /-/g; }
      print(($lvl == 1 ? "" : "    ") . "- [$t](#$id)\n");
    }
  ' "$MERGED.body"
  echo
  cat "$MERGED.body"
} > "$MERGED"
rm -f "$MERGED.header"
rm -f "$MERGED.body"

pandoc "$MERGED" --from gfm+attributes --to docx -o "build/$NAME.docx"
echo "→ docs/documentation-technique/build/$NAME.docx"

SOFFICE="/Applications/LibreOffice.app/Contents/MacOS/soffice"
if [[ -x "$SOFFICE" ]]; then
  "$SOFFICE" --headless --convert-to pdf --outdir build "build/$NAME.docx" >/dev/null 2>&1 && echo "→ docs/documentation-technique/build/$NAME.pdf"
else
  echo "LibreOffice absent : PDF non généré (le .docx peut être exporté depuis Word)." >&2
fi
