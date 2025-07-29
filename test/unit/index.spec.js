"use strict";

const MolApolloService = require("../../");

describe("Test ApolloService exports", () => {
	it("should export GraphQL classes", () => {
		expect(MolApolloService.GraphQLError).toBeDefined();
	});

	it("should export Moleculer modules", () => {
		expect(MolApolloService.ApolloServer).toBeDefined();
		expect(MolApolloService.ApolloService).toBeDefined();
		expect(MolApolloService.moleculerGql).toBeDefined();
	});
});
