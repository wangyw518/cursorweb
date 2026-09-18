FROM node:20-alpine
WORKDIR /app
COPY js/roomStore.js js/roomStore.js
COPY dev/room-server.js dev/room-server.js
ENV HOST=0.0.0.0
ENV PORT=8788
EXPOSE 8788
CMD ["node", "dev/room-server.js"]
