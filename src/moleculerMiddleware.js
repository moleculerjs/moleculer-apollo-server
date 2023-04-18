const { HeaderMap } = require("@apollo/server");
const { parse : urlParse } = require('url');

/* eslint-disable no-console */
function moleculerMiddleware(server,options) {

    const defaultContext  = async () => ({});

    const context = options?.context ?? defaultContext;

	return async (req, res) => {
		if (!req.body) {
			// The json body-parser *always* sets req.body to {} if it's unset (even
			// if the Content-Type doesn't match), so if it isn't set, you probably
			// forgot to set up body-parser. (Note that this may change in the future
			// body-parser@2.)
            return {
                statusCode:500,
                data:"`req.body` is not set; this probably means you forgot to set up the " +
                     "`body-parser` middleware before the Apollo Server middleware."
                }
		}

		const headers = new HeaderMap();
		for (const [key, value] of Object.entries(req.headers)) {
			if (value !== undefined) {
				headers.set(key, Array.isArray(value) ? value.join(", ") : value);
			}
		}
		
        let query;
		try {
			if (req.method === "POST") {
				query = req.body;
			} else {
				query = url.parse(req.url, true).query;
			}
		} catch (error) {
			// Do nothing; `query` stays `undefined`
		}

        const search = urlParse(req.url).search ?? '';

        //TODO: Deal with it, got an GET req, while websocket upgrade request
        // And got an error in executeHTTPGraphQLRequest :  
        // "GraphQL operations must contain a non-empty `query` or a `persistedQuery` extension."
        if ( query === undefined ) {
            // this will send statusCode = 200 and ends request
            return {
                statusCode:-1,
                data:"Bypass socket upgrade request"
            }
        }

        const httpGraphQLRequest  = {
            method: req.method.toUpperCase(),
            headers,
            search,
            body: query,
          };
      
          return server.executeHTTPGraphQLRequest({
            httpGraphQLRequest,
            context: () => context({ req, res }),
          })
          .then(async (httpGraphQLResponse) => {
            
                for (const [key, value] of httpGraphQLResponse.headers) {
                    res.setHeader(key, value);
                }
            
                res.statusCode = httpGraphQLResponse.status || 200;
                
                if (httpGraphQLResponse.body.kind === 'complete') {
                    return {
                        statusCode: res.statusCode,
                        data:httpGraphQLResponse.body.string
                    }
                }

                // httpGraphQLResponse.body.kind == "chunked"
                //FIXME: code4bones: dont't know how to test that !
                const buf = "";
                for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
                    buf += chunk;
                }
                console.warn("**")
                console.warn("*** YOU'RE GOT A CHUNKED RESULT, PLEASE REPORT TEST CASE TO"); 
                console.warn("*** https://github.com/code4bones/moleculer-apollo-server")
                console.warn("**")
                return {
                    statusCode: res.statusCode,
                    data:buf
                }
        })
        .catch((e)=>{
            console.error("moleculerMiddleware",e);
			if ("HttpQueryError" === error.name && error.headers) {
                for (const [key, value] of error.headers) {
                    res.setHeader(key, value);
                }
			}
            return {
                statusCode:e.statusCode || e.code || 500,
                data:e.message
            }
        })
	};
}

module.exports = moleculerMiddleware;
