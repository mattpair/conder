
use tokio_postgres::{NoTls, Client};
use crate::{InterpreterType, GlobalDef};


async fn append(eng: &Engine, def: &GlobalDef, instance: &InterpreterType) -> InterpreterType {
    match eng {
        Engine::Postgres{client} => {
            return InterpreterType::None
        },
        Engine::Panic => {
            panic!("invoking panic storage.")
        }
    }
}

pub enum Engine {
    Panic,
    Postgres{client: Client}
}