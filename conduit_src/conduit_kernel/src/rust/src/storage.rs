
use mongodb::{Database, options::ClientOptions};
use crate::{InterpreterType, GlobalDef};


async fn append(eng: &Engine, def: &GlobalDef, instance: &InterpreterType) -> InterpreterType {
    match eng {
        Engine::Mongo{db} => {
            return InterpreterType::None
        },
        Engine::Panic => {
            panic!("invoking panic storage.")
        }
    }
}

pub enum Engine {
    Panic,
    Mongo{db: Database}
}