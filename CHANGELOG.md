<a name="0.3.7.4"></a>
# 0.3.7.4 (2023-01-22)

- Upgrade to Apollo server v4
- According to v4, moleculerApollo handler disabled and moleculerMiddleware is used instead


<a name="0.3.7.3"></a>
# 0.3.7.3 (2022-11-08)

 [#118](https://github.com/moleculerjs/moleculer-apollo-server/pull/118)

## Changes
 - Original Package.json description
 - Removed extra code from examples
 - Comments cleanup

<a name="0.3.7.2"></a>
# 0.3.7.2 (2022-10-23)

## Changes
- remove createPubSub from subscriptoins:{},will be overriden in methods of host service
- change prepareContextParams, last 2 params - args, "root" added
- binds any functions in serverOptions to service

<a name="0.3.7.1"></a>
# 0.3.7.1 (2022-10-20)

## Changes
- upgrade to Apollo server v3 ( + switch from subscriptions-transport-ws to graphql-ws )
- add Custom PubSub creator ( for use custom PubSubEngine )
- add Update/Reload schema without restarting server/ws
- Playground ( RenderPageOptions ) options in serverOptions.playgroundOptions 
- add serverOptions.subscriptions.onConnect should return acts lile graphql-ws
- add serverOptions.subscriptions.context should return user account ( like "authenticate" method )
- CAUTION: with new graphql-ws subscriptions are not available in build-in playground
- WARNING: graphql-upload disabled ( new versions is mjs type )
- Not tested - DataLoader
- Example in examples/full/
--------------------------------------------------
<a name="0.3.7"></a>
# 0.3.7 (2022-10-04)

## Changes
- update dependencies
- fix CORS methods type definition. [#115](https://github.com/moleculerjs/moleculer-apollo-server/pull/115)
- add `skipNullKeys` resolver option. [#116](https://github.com/moleculerjs/moleculer-apollo-server/pull/116)
- add `checkActionVisibility` option. [#117](https://github.com/moleculerjs/moleculer-apollo-server/pull/117)

--------------------------------------------------
<a name="0.3.6"></a>
# 0.3.6 (2022-01-17)

## Changes
- custom `onConnect` issue fixed. [#105](https://github.com/moleculerjs/moleculer-apollo-server/pull/105)
- update dependencies

--------------------------------------------------
<a name="0.3.5"></a>
# 0.3.5 (2021-11-30)

## Changes
- Prepare params before action calling. [#98](https://github.com/moleculerjs/moleculer-apollo-server/pull/98)
- update dependencies

--------------------------------------------------
<a name="0.3.4"></a>
# 0.3.4 (2021-04-09)

## Changes
- disable timeout for `ws`.
- gracefully stop Apollo Server.
- add `onAfterCall` support.

--------------------------------------------------
<a name="0.3.3"></a>
# 0.3.3 (2020-09-08)

## Changes
- add `ctx.meta.$args` to store additional arguments in case of file uploading.

--------------------------------------------------
<a name="0.3.2"></a>
# 0.3.2 (2020-08-30)

## Changes
- update dependencies
- new `createPubSub` & `makeExecutableSchema` methods
- fix context in WS by [@Hugome](https://github.com/Hugome). [#73](https://github.com/moleculerjs/moleculer-apollo-server/pull/73)

--------------------------------------------------
<a name="0.3.1"></a>
# 0.3.1 (2020-06-03)

## Changes
- update dependencies
- No longer installing subscription handlers when disabled by [@Kauabunga](https://github.com/Kauabunga). [#64](https://github.com/moleculerjs/moleculer-apollo-server/pull/64)

--------------------------------------------------
<a name="0.3.0"></a>
# 0.3.0 (2020-04-04)

## Breaking changes
- transform Uploads to `Stream`s before calling action by [@dylanwulf](https://github.com/dylanwulf). [#71](https://github.com/moleculerjs/moleculer-apollo-server/pull/71)
 
## Changes
- update dependencies

--------------------------------------------------
<a name="0.2.2"></a>
# 0.2.2 (2020-03-04)

## Changes
- update dependencies

--------------------------------------------------
<a name="0.2.1"></a>
# 0.2.1 (2020-03-03)

## Changes
- add `autoUpdateSchema` option. [#63](https://github.com/moleculerjs/moleculer-apollo-server/pull/63)
- Allow multiple rootParams to be used with Dataloader child resolution. [#65](https://github.com/moleculerjs/moleculer-apollo-server/pull/65)

--------------------------------------------------
<a name="0.2.0"></a>
# 0.2.0 (2020-02-12)

## Breaking changes
- minimum required Node version is 10.x
- update dependencies and some require Node 10.x

## Changes
- Typescript definition files added.
- update dependencies
- integration & unit tests added.
- fix graphql undefined of issue when have others RESTful API node
- Avoid mutating in defaultsDeep calls and use proper key in called action params

--------------------------------------------------
<a name="0.1.3"></a>
# 0.1.3 (2019-10-16)

First initial version on NPM. UNTESTED.
