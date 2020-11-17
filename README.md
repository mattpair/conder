Conder Core

# Abstract

This is a set of libraries and containers that can be used to build horizontally scalable, fault-tolerant, and portable systems. At the moment, we only have stored procedure servers. However, there will be more in the future.

## Intermediate Representation (IR)

The IR is the simplest way to describe some computation that can be executed on a stored procedure sever. It's basically 1:1 with functionality a simple programming language could offer with the syntax boiled off and operations untangled.

The IR representation is compiled to executable ops. However, the IR can have any number of compile steps which could in theory optimize or ensure correctness.


## Ops

Ops are what is actually executed by the stored procedure server. If one is crazy enough, they could build something that works with the op writing interface directly. However, you open yourself up to a host of runtime errors, so you better know what you're doing.

### Disclaimer

This project is pretty new and still requires much more work before you can build complete and useful languages on top of it.

#### See also

[The stored procedure server (sps)](https://hub.docker.com/r/condersystems/sps)
[Tuna-lang](https://github.com/Conder-Systems/tuna-lang)