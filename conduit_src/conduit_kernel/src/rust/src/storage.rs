
use mongodb::{Database, options::ClientOptions, bson, results, Client};
use crate::{InterpreterType, Schema};



pub(crate) async fn append(eng: &Engine, storeName: &str, schema: &Schema, instance: &InterpreterType) -> InterpreterType {
    match eng {
        Engine::Mongo{db} => {
            
            let collection = db.collection(&storeName);
            let result: Option<String> = match instance { 
                InterpreterType::Array(v) => {
                    let bs: Vec<bson::Document> = v.into_iter().map(|i| {
                        match bson::to_document(i) {
                            Ok(b) => b,
                            Err(e) => panic!("Unable to convert document to bson")
                        }
                    }).collect();
                    match collection.insert_many(bs, None).await {
                        Ok(r) => None,
                        Err(e) => Some(format!("Failure inserting {}", e))
                    }
                },
                _ => match collection.insert_one(match bson::to_document(instance) {
                    Ok(b) => b,
                    Err(e) => panic!("Unable to convert to bson")
                }, None).await {
                    Ok(r) => None,
                    Err(e) => Some(format!("Failure inserting {}", e))
                }
            };

            match result {
                Some(e) => panic!(e),
                None => return InterpreterType::None
            };
        },
        Engine::Panic => {
            panic!("invoking panic storage.")
        }
    }
}

pub enum Engine {
    Panic,
    Mongo{db: mongodb::Database}
}
