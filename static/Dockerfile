FROM nginx:alpine
# Copies the whole repo root into nginx's doc root. Put every asset you want
# served (HTML, CSS, JS, images) at the repo ROOT — not in a public/ or src/
# subdirectory, or it will be served under that path (e.g. /public/app.js) or
# missed entirely. .dockerignore keeps build/meta files out of the image.
COPY . /usr/share/nginx/html/
EXPOSE 80
