# Arte do jogo (naves e raças)

Solte os PNGs aqui seguindo **exatamente** os nomes abaixo. Enquanto o arquivo não existir,
o jogo mostra um placeholder automaticamente — então pode subir aos poucos.

## Especificação recomendada
- **Naves** (`art/ships/*.png`): PNG **com fundo transparente**, ~512×512, recorte quadrado. Aparece como ícone na tabela de naves.
- **Raças** (`art/races/*.png`): PNG, ~600×600 (retrato/emblema da raça). Aparece no banner da Página Principal.

## Raças (5) → `art/races/<arquivo>`
- Humanos      -> `races/humanos.png`
- Daharan      -> `races/daharan.png`
- Rakshasa     -> `races/rakshasa.png`
- Mech         -> `races/mech.png`
- Insecta      -> `races/insecta.png`

## Naves (60) → `art/ships/<arquivo>`

### Humanos (greco-romano)
- Artemis -> `ships/artemis.png`
- Perseu -> `ships/perseu.png`
- Ares -> `ships/ares.png`
- Deméter -> `ships/demeter.png`
- Vulcano -> `ships/vulcano.png`
- Hera -> `ships/hera.png`
- Tanatos -> `ships/tanatos.png`
- Netuno -> `ships/netuno.png`
- Hermes -> `ships/hermes.png`
- Apolo -> `ships/apolo.png`
- Hercules -> `ships/hercules.png`
- Zeus -> `ships/zeus.png`

### Daharan (egípcio)
- Osíris -> `ships/osiris.png`
- Isis -> `ships/isis.png`
- Hórus -> `ships/horus.png`
- Geb -> `ships/geb.png`
- Seth -> `ships/seth.png`
- Bastet -> `ships/bastet.png`
- Nut -> `ships/nut.png`
- Sekmet -> `ships/sekmet.png`
- Anúbis -> `ships/anubis.png`
- Thoth -> `ships/thoth.png`
- Néftis -> `ships/neftis.png`
- Amon-Rá -> `ships/amon-ra.png`

### Rakshasa (nórdico)
- Thor -> `ships/thor.png`
- Njord -> `ships/njord.png`
- Heimdall -> `ships/heimdall.png`
- Attila -> `ships/attila.png`
- Hela -> `ships/hela.png`
- Fenrir -> `ships/fenrir.png`
- Loki -> `ships/loki.png`
- Freya -> `ships/freya.png`
- Vidar -> `ships/vidar.png`
- Baldur -> `ships/baldur.png`
- Tyr -> `ships/tyr.png`
- Odin -> `ships/odin.png`

### Mech (celta / máquina)
- Caillech -> `ships/caillech.png`
- Cerridwen -> `ships/cerridwen.png`
- Gwynn -> `ships/gwynn.png`
- Badb -> `ships/badb.png`
- Smertrios -> `ships/smertrios.png`
- Lugh -> `ships/lugh.png`
- Morrigan -> `ships/morrigan.png`
- Fea -> `ships/fea.png`
- Macha -> `ships/macha.png`
- Scathach -> `ships/scathach.png`
- Danu -> `ships/danu.png`
- Cernunnos -> `ships/cernunnos.png`

### Insecta (insetos)
- Formiga -> `ships/formiga.png`
- Abelha -> `ships/abelha.png`
- Vespa -> `ships/vespa.png`
- Mosca -> `ships/mosca.png`
- Besouro -> `ships/besouro.png`
- Mosquito -> `ships/mosquito.png`
- Aranha -> `ships/aranha.png`
- Louva-a-Deus -> `ships/louva-a-deus.png`
- Escorpião -> `ships/escorpiao.png`
- Cupim -> `ships/cupim.png`
- Gafanhoto -> `ships/gafanhoto.png`
- Rainha -> `ships/rainha.png`

## Regra do nome de arquivo
Tudo minúsculo, sem acento, espaços viram `-`. (É o `slug()` em `server/src/game/catalog.ts`.)
Ex.: "Amon-Rá" → `amon-ra.png`, "Louva-a-Deus" → `louva-a-deus.png`.
