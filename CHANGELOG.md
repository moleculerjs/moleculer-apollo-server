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
