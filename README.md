![Moleculer logo](http://moleculer.services/images/banner.png)

[![Build Status](https://travis-ci.org/moleculerjs/moleculer-apollo-server.svg?branch=master)](https://travis-ci.org/moleculerjs/moleculer-apollo-server)
[![Coverage Status](https://coveralls.io/repos/github/moleculerjs/moleculer-apollo-server/badge.svg?branch=master)](https://coveralls.io/github/moleculerjs/moleculer-apollo-server?branch=master)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/<----hash----->)](https://www.codacy.com/app/<---username---->/moleculer-apollo-server?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=moleculerjs/moleculer-apollo-server&amp;utm_campaign=Badge_Grade)
[![Code Climate](https://codeclimate.com/github/moleculerjs/moleculer-apollo-server/badges/gpa.svg)](https://codeclimate.com/github/moleculerjs/moleculer-apollo-server)
[![David](https://img.shields.io/david/moleculerjs/moleculer-apollo-server.svg)](https://david-dm.org/moleculerjs/moleculer-apollo-server)
[![Known Vulnerabilities](https://snyk.io/test/github/moleculerjs/moleculer-apollo-server/badge.svg)](https://snyk.io/test/github/moleculerjs/moleculer-apollo-server)
[![Join the chat at https://gitter.im/moleculerjs/moleculer](https://badges.gitter.im/moleculerjs/moleculer.svg)](https://gitter.im/moleculerjs/moleculer?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# moleculer-apollo-server [![NPM version](https://img.shields.io/npm/v/moleculer-apollo-server.svg)](https://www.npmjs.com/package/moleculer-apollo-server)

[Apollo GraphQL server](https://www.apollographql.com/docs/apollo-server/) mixin for [Moleculer API Gateway](https://github.com/moleculerjs/moleculer-web)

## Features

## Install
```
npm install moleculer-apollo-server moleculer-web --save
```

## Usage
This example demonstrates how to setup a Moleculer API Gateway with GraphQL mixin, that handles incoming GraphQL requests via the default `/graphql` endpoint.

```js
"use strict";

const ApiGateway 	= require("moleculer-web");
const { ApolloService } = require("moleculer-apollo-server");

module.exports = {
    name: "api",

    mixins: [
        // Gateway
        ApiGateway,

        // GraphQL Apollo Server
        ApolloService({

            // Global GraphQL typeDefs
            typeDefs: ``,

            // Global resolvers
            resolvers: {},

            // API Gateway route options
            routeOptions: {
                path: "/graphql",
                cors: true,
                mappingPolicy: "restrict"
            },

            // https://www.apollographql.com/docs/apollo-server/v2/api/apollo-server.html
            serverOptions: {
                tracing: true,

                engine: {
                    apiKey: process.env.APOLLO_ENGINE_KEY
                }
            }
        })
    ]
};

```

Start your Moleculer project, open http://localhost:3000/graphql in your browser to run queries using [graphql-playground](https://github.com/prismagraphql/graphql-playground), or send GraphQL requests directly to the same URL.


**Define queries & mutations in service action definitions**

```js
module.exports = {
    name: "greeter", 

    actions: {
        hello: {
            graphql: {
                query: "hello: String"
            },
            handler(ctx) {
                return "Hello Moleculer!"
            }
        },
        welcome: {
            params: {
                name: "string"
            },
            graphql: {
                mutation: "welcome(name: String!): String"
            },
            handler(ctx) {
                return `Hello ${ctx.params.name}`;
            }
        }
    }
};
```

**Generated schema**
```gql
type Mutation {
  welcome(name: String!): String
}

type Query {
  hello: String
}
```

# Test
```
$ npm test
```

In development with watching

```
$ npm run ci
```

# Contribution
Please send pull requests improving the usage and fixing bugs, improving documentation and providing better examples, or providing some testing, because these things are important.

# License
The project is available under the [MIT license](https://tldrlegal.com/license/mit-license).

# Contact
Copyright (c) 2018 MoleculerJS

[![@moleculerjs](https://img.shields.io/badge/github-moleculerjs-green.svg)](https://github.com/moleculerjs) [![@MoleculerJS](https://img.shields.io/badge/twitter-MoleculerJS-blue.svg)](https://twitter.com/MoleculerJS)