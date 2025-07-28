# Stage 1: Build the React frontend
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Create the production server
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
# Install only production dependencies
RUN npm install --only=production

# Copy the backend server and the built frontend from the build stage
COPY --from=build /app/build ./build
COPY server.js .

# Expose the port the server runs on
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
