# phpBB sobre PHP/Apache oficiais (imagens que sempre baixam).
FROM php:8.3-apache

# Extensões que o phpBB precisa (gd, mysqli, mbstring) + ferramentas.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libpng-dev libjpeg-dev libfreetype6-dev libonig-dev unzip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" gd mysqli mbstring \
    && a2enmod rewrite

# Baixa o phpBB e guarda em /opt/phpbb (o entrypoint copia pro volume na 1ª vez).
ARG PHPBB_VERSION=3.3.14
RUN curl -fsSL -o /tmp/phpbb.zip "https://download.phpbb.com/pub/release/3.3/${PHPBB_VERSION}/phpBB-${PHPBB_VERSION}.zip" \
    && unzip -q /tmp/phpbb.zip -d /tmp \
    && mkdir -p /opt/phpbb && cp -a /tmp/phpBB3/. /opt/phpbb/ \
    && rm -rf /tmp/phpbb.zip /tmp/phpBB3

# Pacote de idioma Portugues (Brasil) — comunidade suportephpbb (GPL, compat. 3.3).
# Fica em /opt/phpbb/language/pt_br; o entrypoint garante a copia pro webroot.
RUN curl -fsSL -o /tmp/ptbr.tar.gz "https://github.com/suportephpbb/phpbb/archive/refs/heads/master.tar.gz" \
    && mkdir -p /tmp/ptbr && tar xzf /tmp/ptbr.tar.gz -C /tmp/ptbr --strip-components=1 \
    && cp -a /tmp/ptbr/language/pt_br /opt/phpbb/language/pt_br \
    && rm -rf /tmp/ptbr /tmp/ptbr.tar.gz

# Estilo Galactic (filho do prosilver). O entrypoint sincroniza pro webroot.
COPY styles/galactic /opt/phpbb/styles/galactic

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# phpBB atrás de proxy HTTPS (Caddy): confia no protocolo encaminhado.
RUN { echo 'SetEnvIf X-Forwarded-Proto "https" HTTPS=on'; } > /etc/apache2/conf-available/forwarded.conf \
    && a2enconf forwarded

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
