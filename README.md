# Browser 🖥️

[![Discord](https://img.shields.io/discord/564160730845151244?label=discord&style=flat-square)](https://appwrite.io/discord)
[![Twitter Account](https://img.shields.io/twitter/follow/appwrite?color=00acee&label=twitter&style=flat-square)](https://twitter.com/appwrite)
[![appwrite.io](https://img.shields.io/badge/appwrite-.io-f02e65?style=flat-square)](https://appwrite.io)

Appwrite Browser is simple to use and extend REST API meant to simplify screenshot preview, reports, and analysis.

## Usage

Add Appwrite Browser to your `docker-compose.yml`.

```
services:
  appwrite-browser:
    container_name: appwrite-browser
    image: appwrite/browser:0.1.0
    networks:
      - appwrite
    environment:
      - APPWRITE_BROWSER_SECRET=secret
```

Start browser alongside rest of your services.

```
docker compose up -d
```

Communicate with Appwrite Browser endpoints.

```bash
curl -X GET -H "Authorization: Bearer secret" http://appwrite-browser:3000/screenshot?url=http://google.com/ping
```

## Development

Make sure you have [pnpm](https://pnpm.io/) installed.

To install dependencies, run the following command.

```bash
pnpm i
```

Next, duplicate `.env.example` into `.env`, and update the values.

```bash
cp .env.example .env
```

Finally, start the server by running `npm start`, and visit use endpoint `http://localhost:3000` as REST API endpoint. To authorize, provide header `Authorization: Bearer <secret>`.

## Contributing

All code contributions, including those of people having commit access, must go through a pull request and be approved by a core developer before being merged. This is to ensure a proper review of all the code.

We truly ❤️ pull requests! If you wish to help, you can learn more about how you can contribute to this project in the [contribution guide](CONTRIBUTING.md).
