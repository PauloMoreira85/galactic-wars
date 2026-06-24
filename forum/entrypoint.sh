#!/bin/bash
set -e
# Na 1ª vez (volume vazio), popula o webroot com o phpBB baixado na imagem.
if [ ! -f /var/www/html/index.php ] && [ ! -f /var/www/html/config.php ]; then
  cp -a /opt/phpbb/. /var/www/html/
fi
# Garante o pacote pt_br no webroot, inclusive em forum JA instalado (volume antigo).
if [ -d /opt/phpbb/language/pt_br ] && [ ! -d /var/www/html/language/pt_br ]; then
  cp -a /opt/phpbb/language/pt_br /var/www/html/language/pt_br
fi
# Sincroniza o estilo Galactic a cada deploy (sempre, pra refletir ajustes de CSS).
if [ -d /opt/phpbb/styles/galactic ]; then
  rm -rf /var/www/html/styles/galactic
  cp -a /opt/phpbb/styles/galactic /var/www/html/styles/galactic
fi
chown -R www-data:www-data /var/www/html
exec apache2-foreground
