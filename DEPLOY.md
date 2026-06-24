# Deploy do Galactic Wars (DigitalOcean Droplet)

Sobe o jogo num Droplet com Docker + Caddy (HTTPS automático). SQLite num volume que persiste.

## 1. Criar o Droplet
- DigitalOcean → Create → Droplet.
- Imagem: **Ubuntu 24.04**. Plano: **Basic / Regular / US$6**. Região: **New York** (sem região BR; tick de 1h ⇒ ok).
- Autenticação: sua SSH key.
- Anote o **IP** do droplet.

## 2. Apontar o domínio (Registro.br)
No painel do `galacticwar.com.br`, crie registros **A** apontando para o IP:
- `galacticwar.com.br`        → IP do droplet
- `www.galacticwar.com.br`    → IP do droplet
(Espere o DNS propagar — pode levar de minutos a algumas horas. O HTTPS do Caddy só funciona depois disso.)

## 3. Instalar Docker no droplet
```
ssh root@SEU_IP
curl -fsSL https://get.docker.com | sh
```

## 4. Subir o código
Opção A (GitHub): suba o repositório e clone:
```
git clone https://github.com/SEU_USUARIO/galactic-wars.git
cd galactic-wars
```
Opção B (sem GitHub): do seu PC, copie a pasta (exclui node_modules):
```
rsync -av --exclude node_modules --exclude '**/dist' --exclude '**/*.db*' ./ root@SEU_IP:/root/galactic-wars/
```

## 5. Definir o segredo
No droplet, dentro da pasta do projeto, crie um arquivo `.env`:
```
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
```

## 6. Subir tudo
```
docker compose up -d --build
```
Pronto. Acesse **https://galacticwar.com.br** (depois do DNS propagar; o Caddy emite o certificado sozinho).

## Comandos úteis
- Ver logs:        `docker compose logs -f app`
- Atualizar (novo código): `git pull && docker compose up -d --build`
- Reiniciar:       `docker compose restart`
- Backup do banco: `docker run --rm -v galactic-wars_gw-data:/data -v $PWD:/bkp alpine cp /data/prod.db /bkp/prod-backup.db`

## Notas
- A porta interna do app é 3001; o Caddy expõe 80/443.
- O SQLite fica no volume `gw-data` (persiste entre deploys). Aguenta dezenas/centenas de jogadores; se crescer muito, migrar pra Postgres (trocar `provider` no schema + DATABASE_URL).
- O motor de tick roda dentro do app; `restart: unless-stopped` garante que volta sozinho se o droplet reiniciar.
