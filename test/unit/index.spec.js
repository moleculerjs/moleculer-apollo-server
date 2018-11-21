"use strict";

const { ServiceBroker } = require("moleculer");
const MyService = require("../../src");

describe("Test MyService", () => {
	const broker = new ServiceBroker();
	const service = broker.createService(MyService);

	beforeAll(() => broker.start());
	afterAll(() => broker.stop());

	it("should be created", () => {
		expect(service).toBeDefined();
	});

	it("should return with 'Hello Anonymous'", () => {
		return broker.call("apollo-server.test").then(res => {
			expect(res).toBe("Hello Anonymous");
		});
	});

	it("should return with 'Hello John'", () => {
		return broker.call("apollo-server.test", { name: "John" }).then(res => {
			expect(res).toBe("Hello John");
		});
	});
});
