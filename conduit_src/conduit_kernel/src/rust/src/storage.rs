
use mongodb::{Database, options::{ClientOptions, FindOptions, FindOneOptions}, bson, bson::{doc}, results, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use futures::stream::StreamExt;

use crate::{InterpreterType, Schema};

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

static ADDRESS: &str = "__conduit_entity_id";

fn suppression_into_mongo_projection(suppress_doc: &HashMap<String, InterpreterType>) -> bson::Document {
    let mut result = doc! {};

    if suppress_doc.contains_key(ADDRESS) {
        result.insert("_id", false);
    }
    for (k, v) in suppress_doc {
        if k == ADDRESS {
            continue;
        }
        match v {
            InterpreterType::Object(inner) => result.insert(k, suppression_into_mongo_projection(inner)),
            InterpreterType::None => result.insert(k, false),
            _ => panic!("Malformatted suppression doc")
        };
    }

    return result;
}

pub(crate) async fn query(eng: &Engine, storeName: &str, suppress_doc: &HashMap<String, InterpreterType>) -> InterpreterType {
    match eng {
        Engine::Mongo{db} => {
            
            let collection = db.collection(&storeName);
            let mongo_proj = suppression_into_mongo_projection(suppress_doc);


            let options = FindOptions::builder().projection(Some(mongo_proj)).build();
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

pub(crate) async fn find_one(eng: &Engine, storeName: &str, query_doc: &InterpreterType, suppress_doc: &HashMap<String, InterpreterType>) -> InterpreterType {
    let r = match eng {
        Engine::Mongo{db} => {
            let collection = db.collection(&storeName);
            let mongo_proj = suppression_into_mongo_projection(suppress_doc);
            let options = FindOneOptions::builder().projection(Some(mongo_proj)).build();

            let res = match collection.find_one(bson::to_document(&query_doc).unwrap(), options).await {
                Ok(r) => match r {
                    Some(o) => bson::from_document(o).unwrap(),
                    None => InterpreterType::None
                },
                Err(e) => {
                    eprintln!("Could not dereference pointer: {}", e);
                    InterpreterType::None
                }
            };
            res
        },
        _ => panic!("Invalid derefence")
    };
    return r;
}

pub(crate) async fn delete_one(eng: &Engine, storeName: &str, query_doc: &InterpreterType) -> InterpreterType {
    let r = match eng {
        Engine::Mongo{db} => {
            let collection = db.collection(&storeName);
            let d = match collection.delete_one(bson::to_document(query_doc).unwrap(), None).await {
                Ok(result) => result.deleted_count == 1,
                Err(e) => {
                    eprintln!("Failure deleting: {}", e);
                    false
                }
            };
            InterpreterType::bool(d)
        },
        _ => panic!("invalid delete")
    };
    return r
}

pub(crate) async fn measure(eng: &Engine, storeName: &str) -> InterpreterType {
    let r = match eng {
        Engine::Mongo{db} => {
            let collection = db.collection(&storeName);
            let d = match collection.estimated_document_count(None).await {
                Ok(count) => count,
                Err(e) => {
                    eprintln!("Failure measuring: {}", e);
                    0
                }
            };
            InterpreterType::int(d)
        },
        _ => panic!("invalid delete")
    };
    return r
}

pub enum Engine {
    Panic,
    Mongo{db: mongodb::Database}
}
