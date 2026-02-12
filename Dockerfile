FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN chmod +x ./scripts/docker-entrypoint.sh

ENV HOST=0.0.0.0
ENV PORT=8787
ENV PERSIST_DIR=/data
ENV DB_NAME=picoshare_db

EXPOSE 8787
VOLUME ["/data"]

CMD ["./scripts/docker-entrypoint.sh"]

