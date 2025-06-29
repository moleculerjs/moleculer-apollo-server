/*
 * Apollo Server for Moleculer API Gateway.
 *
 * Copyright (c) 2025 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
 * MIT Licensed
 */

"use strict";

const { ApolloServer } = require("./src/ApolloServer");
const ApolloService = require("./src/service");
const gql = require("./src/gql");

module.exports = {
	// Apollo Server
	ApolloServer,

	// Apollo Moleculer Service
	ApolloService,

	// Moleculer gql formatter
	moleculerGql: gql
};
