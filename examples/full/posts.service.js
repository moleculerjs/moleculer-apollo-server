"use strict";

const _ = require("lodash");

const posts = [
	{ id: 1, title: "First post", author: 3, votes: 2, voters: [2,5], createdAt: new Date('2018-08-23T08:10:25') },
	{ id: 2, title: "Second post", author: 1, votes: 0, voters: [], createdAt:new Date('2018-11-23T12:59:30')  },
	{ id: 3, title: "Third post", author: 2, votes: 1, voters: [5], createdAt:new Date('2018-02-23T22:24:28')  },
	{ id: 4, title: "4th post", author: 3, votes: 3, voters: [4,1,2], createdAt: new Date('2018-10-23T10:33:00') },
	{ id: 5, title: "5th post", author: 5, votes: 1, voters: [4], createdAt: new Date('2018-11-24T21:15:30') },

]

module.exports = {
	name: "posts",
	settings: {
		graphql: {
			type: `
				type Post {
					id: Int!,
					title: String!,
					author: User!,
					votes: Int!,
					voters: [User],
					createdAt: Timestamp
				}
			`,
			resolvers: {
				Post: {
					author: {
						action: "users.resolve",
						rootParams: {
							"author": "id"
						}
					},
					voters: {
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
				query: "posts(limit: Int): [Post]"
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
		}
	},

	methods: {
		findByID(id) {
			return _.cloneDeep(posts.find(post => post.id == id));
		}		
	}
};
