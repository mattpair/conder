
use mongodb::{Database, options::{ClientOptions, FindOptions}, bson, bson::{doc}, results, Client};
use crate::{InterpreterType, Schema};
use futures::stream::StreamExt;

pub(crate) async fn append(eng: &Engine, storeName: &str, schema: &Schema, instance: &InterpreterType) -> InterpreterType {
    match eng {
        Engine::Mongo{db} => {
            
            let collection = db.collection(&storeName);
            let result: Option<String> = match instance { 
                InterpreterType::Array(v) => {
                    let bs: Vec<bson::Document> = v.into_iter().map(|i| bson::to_document(i).unwrap()).collect();
                    match collection.insert_many(bs, None).await {
                        Ok(r) => None,
                        Err(e) => Some(format!("Failure inserting {}", e))
                    }
                },
                _ => match collection.insert_one(bson::to_document(instance).unwrap(), None).await {
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
pub(crate) async fn getAll(eng: &Engine, storeName: &str, schema: &Schema) -> InterpreterType {
    match eng {
        Engine::Mongo{db} => {
            
            let collection = db.collection(&storeName);
            let options = FindOptions::builder().projection(Some(
                doc! {"_id": false}

            )).build();
            let mut res = match collection.find(None, options).await {
                Ok(c) => c,
                Err(e) => panic!(e)
            };

            let mut ret = vec![];
            while let Some(v) = res.next().await {
                match v {
                    Ok(doc) => ret.push(bson::from_document(doc).unwrap()),
                    Err(e) => panic!(e)
                };
            }
            
            return InterpreterType::Array(ret)
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
