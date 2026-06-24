#!/bin/bash
set -e
# Na 1ª vez (volume vazio), popula o webroot com o phpBB baixado na imagem.
if [ ! -f /var/www/html/index.php ] && [ ! -f /var/www/html/config.php ]; then
  cp -a /opt/phpbb/. /var/www/html/
fi
chown -R www-data:www-data /var/www/html
exec apache2-foreground
