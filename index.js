/*
 * moleculer-apollo-server
 *
 * Apollo Server for Moleculer API Gateway.
 *
 * Based on "apollo-server-micro"
 *
 * 		https://github.com/apollographql/apollo-server/blob/master/packages/apollo-server-micro/
 *
 *
 * Copyright (c) 2020 MoleculerJS (https://github.com/moleculerjs/moleculer-apollo-server)
 * MIT Licensed
 */

"use strict";

const { GraphQLError } = require("graphql");

// const GraphQLUpload = require("graphql-upload");
const { ApolloServer } = require("./src/ApolloServer");
const ApolloService = require("./src/service");
const gql = require("./src/gql");

module.exports = {
	// Only GraphQLError exposes, other errors need custom creation
	GraphQLError,
	// Core
	// Next  defs are removed in v4 from core
	/*
	GraphQLExtension: core.GraphQLExtension,
	gql: core.gql,
	ApolloError: core.ApolloError,
	toApolloError: core.toApolloError,
	SyntaxError: core.SyntaxError,
	ValidationError: core.ValidationError,
	AuthenticationError: core.AuthenticationError,
	ForbiddenError: core.ForbiddenError,
	UserInputError: core.UserInputError,
	defaultPlaygroundOptions: core.defaultPlaygroundOptions,
    */

	// GraphQL Upload
	// GraphQLUpload,

	// Apollo Server
	ApolloServer,

	// Apollo Moleculer Service
	ApolloService,

	// Moleculer gql formatter
	moleculerGql: gql,
};
