FROM nginx:alpine

# Copy all website files to the NGINX html directory
COPY . /usr/share/nginx/html

# Cloud Run provides the port via the PORT environment variable
# We need to update the NGINX configuration to listen on that port before starting
CMD sed -i -e 's/listen  *80;/listen '"$PORT"';/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'
