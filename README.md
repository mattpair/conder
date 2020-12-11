
# Abstract

This is a set of compiler technologies that can be used to build programming languages with non volatile state. 

## Intermediate Representation (IR)

The IR is the simplest way to describe some computation that runs with some mixture of global and local state. It's basically 1:1 with functionality a simple programming language could offer with the syntax boiled off and operations untangled. The IR is [decoupled from any specific storage](conder_core/src/main/abstract/IR.ts), so we could provide different global state backends in the future if so desired.

The IR representation is compiled to executable ops. However, the IR can have any number of compile steps which can optimize or ensure correctness.

## Ops

Ops are what is actually executed by the stored procedure server. If one is crazy enough, they could build something that works with the op writing interface directly. However, you open yourself up to a host of runtime errors, so you better know what you're doing.

# Building Your Own Language 

If you want to build your own language on top of conder, feel free to reach out.

#### See also

[Tuna-lang](https://github.com/Conder-Systems/tuna-lang)

### Licensing

All TypeScript code is under the NSCA license. The interpreter (rust code) is under the AGPL to ensure standardization within the community.