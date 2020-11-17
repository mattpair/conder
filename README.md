
# Abstract

This is a set of libraries that can be used to build programming languages with non volatile state. At the moment, the only way to run conder code is on a stored procedure server [stored procedure server (sps)](https://hub.docker.com/r/condersystems/sps).

## Intermediate Representation (IR)

The IR is the simplest way to describe some computation that can be executed on a stored procedure sever. It's basically 1:1 with functionality a simple programming language could offer with the syntax boiled off and operations untangled. The IR is decoupled from any specific storage, so we could provide different global state backends in the future if so desired.

The IR representation is compiled to executable ops. However, the IR can have any number of compile steps which could in theory optimize or ensure correctness.


## Ops

Ops are what is actually executed by the stored procedure server. If one is crazy enough, they could build something that works with the op writing interface directly. However, you open yourself up to a host of runtime errors, so you better know what you're doing.

### Disclaimer

This project is pretty new and still requires much more work before you can build complete, useful, and reliable languages on top of it.

#### See also

[The stored procedure server (sps)](https://hub.docker.com/r/condersystems/sps)
[Tuna-lang](https://github.com/Conder-Systems/tuna-lang)
