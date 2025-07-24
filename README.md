![Moleculer logo](http://moleculer.services/images/banner.png)

# moleculer-apollo-server [![CI test](https://github.com/moleculerjs/moleculer-apollo-server/actions/workflows/ci.yml/badge.svg)](https://github.com/moleculerjs/moleculer-apollo-server/actions/workflows/ci.yml) [![NPM version](https://img.shields.io/npm/v/moleculer-apollo-server.svg)](https://www.npmjs.com/package/moleculer-apollo-server)

[Apollo GraphQL server 5](https://www.apollographql.com/docs/apollo-server/) mixin for [Moleculer API Gateway](https://github.com/moleculerjs/moleculer-web)

## Features

## Install
```
npm i moleculer-apollo-server moleculer-web graphql
```

## Usage
This example demonstrates how to setup a Moleculer API Gateway with GraphQL mixin in order to handle incoming GraphQL requests via the default `/graphql` endpoint.

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

            // https://www.apollographql.com/docs/apollo-server/api/apollo-server#options
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

Start your Moleculer project, open http://localhost:3000/graphql in your browser to run queries using Apollo Studio or send GraphQL requests directly to the same URL.


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

### Resolvers between services

**posts.service.js**
```js
module.exports = {
    name: "posts",
    settings: {
        graphql: {
            type: `
                """
                This type describes a post entity.
                """			
                type Post {
                    id: Int!
                    title: String!
                    author: User!
                    votes: Int!
                    voters: [User]
                    createdAt: Timestamp
                }
            `,
            resolvers: {
                Post: {
                    author: {
                        // Call the `users.resolve` action with `id` params
                        action: "users.resolve",
                        rootParams: {
                            "author": "id"
                        }
                    },
                    voters: {
                        // Call the `users.resolve` action with `id` params
                        action: "users.resolve",
                        rootParams: {
                            "voters": "id"
                        }
                    }
                }
            }
        }
    },
    actions: {
        find: {
            //cache: true,
            params: {
                limit: { type: "number", optional: true }
            },
            graphql: {
                query: `posts(limit: Int): [Post]`
            },
            handler(ctx) {
                let result = _.cloneDeep(posts);
                if (ctx.params.limit)
                    result = posts.slice(0, ctx.params.limit);
                else
                    result = posts;

                return _.cloneDeep(result);
            }
        },

        findByUser: {
            params: {
                userID: "number"
            },
            handler(ctx) {
                return _.cloneDeep(posts.filter(post => post.author == ctx.params.userID));
            }
        },
    }
};
```

**users.service.js**
```js
module.exports = {
    name: "users",
    settings: {
        graphql: {
            type: `
                """
                This type describes a user entity.
                """			
                type User {
                    id: Int!
                    name: String!
                    birthday: Date
                    posts(limit: Int): [Post]
                    postCount: Int
                }
            `,
            resolvers: {
                User: {
                    posts: {
                        // Call the `posts.findByUser` action with `userID` param.
                        action: "posts.findByUser",
                        rootParams: {
                            "id": "userID"
                        }
                    },
                    postCount: {
                        // Call the "posts.count" action
                        action: "posts.count",
                        // Get `id` value from `root` and put it into `ctx.params.query.author`
                        rootParams: {
                            "id": "query.author"
                        }
                    }                    
                }
            }			
        }
    },
    actions: {
        find: {
            //cache: true,
            params: {
                limit: { type: "number", optional: true }
            },
            graphql: {
                query: "users(limit: Int): [User]"
            },
            handler(ctx) {
                let result = _.cloneDeep(users);
                if (ctx.params.limit)
                    result = users.slice(0, ctx.params.limit);
                else
                    result = users;

                return _.cloneDeep(result);
            }
        },

        resolve: {
            params: {
                id: [
                    { type: "number" },
                    { type: "array", items: "number" }
                ]
            },
            handler(ctx) {
                if (Array.isArray(ctx.params.id)) {
                    return _.cloneDeep(ctx.params.id.map(id => this.findByID(id)));
                } else {
                    return _.cloneDeep(this.findByID(ctx.params.id));
                }
            }
        }
    }
};
```

### Dataloader
moleculer-apollo-server supports [DataLoader](https://github.com/graphql/dataloader) via configuration in the resolver definition.
The called action must be compatible with DataLoader semantics -- that is, it must accept params with an array property and return an array of the same size,
with the results in the same order as they were provided.

To activate DataLoader for a resolver, simply add `dataLoader: true` to the resolver's property object in the `resolvers` property of the service's `graphql` property:

```js
settings: {
    graphql: {
        resolvers: {
            Post: {
                author: {
                    action: "users.resolve",
                    dataLoader: true,
                    rootParams: {
                        author: "id",
                    },
                },
                voters: {
                    action: "users.resolve",
                    dataLoader: true,
                    rootParams: {
                        voters: "id",
                    },
                },
                ...
```
Since DataLoader only expects a single value to be loaded at a time, only one `rootParams` key/value pairing will be utilized, but `params` and GraphQL child arguments work properly.

You can also specify [options](https://github.com/graphql/dataloader#api) for construction of the DataLoader in the called action definition's `graphql` property.  This is useful for setting things like `maxBatchSize'.

```js
resolve: {
    params: {
        id: [{ type: "number" }, { type: "array", items: "number" }],
        graphql: { dataLoaderOptions: { maxBatchSize: 100 } },
    },
    handler(ctx) {
        this.logger.debug("resolve action called.", { params: ctx.params });
        if (Array.isArray(ctx.params.id)) {
            return _.cloneDeep(ctx.params.id.map(id => this.findByID(id)));
        } else {
            return _.cloneDeep(this.findByID(ctx.params.id));
        }
    },
},
```
It is unlikely that setting any of the options which accept a function will work properly unless you are running moleculer in a single-node environment.  This is because the functions will not serialize and be run by the moleculer-web Api Gateway.

## Examples

- [Simple](examples/simple/index.js)
  - `npm run dev`
- [Full](examples/full/index.js)
  - `npm run dev full`
- [Full With Dataloader](examples/full/index.js)
  - set `DATALOADER` environment variable to `"true"`
  - `npm run dev full`

## Test
```
$ npm test
```

In development with watching

```
$ npm run ci
```

## Contribution
Please send pull requests improving the usage and fixing bugs, improving documentation and providing better examples, or providing some testing, because these things are important.

## License
The project is available under the [MIT license](https://tldrlegal.com/license/mit-license).

## Contact
Copyright (c) 2025 MoleculerJS

[![@moleculerjs](https://img.shields.io/badge/github-moleculerjs-green.svg)](https://github.com/moleculerjs) [![@MoleculerJS](https://img.shields.io/badge/twitter-MoleculerJS-blue.svg)](https://twitter.com/MoleculerJS)
