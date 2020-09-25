
use mongodb::{Database, options, options::{ClientOptions, FindOptions, FindOneOptions, InsertManyOptions, FindOneAndUpdateOptions}, bson, bson::{doc}, results, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use futures::stream::StreamExt;

use crate::{InterpreterType, Schema};

pub(crate) async fn append(db: &Database, storeName: &str, schema: &Schema, instance: &InterpreterType) -> InterpreterType {         
    let collection = db.collection(&storeName);
    match instance { 
        InterpreterType::Array(v) => {
            let bs: Vec<bson::Document> = v.into_iter().map(|i| bson::to_document(i).unwrap()).collect();
            match collection.insert_many(bs, None).await {
                Ok(mut r) => {
                    let mut ordered_keys: Vec<usize> = Vec::with_capacity(r.inserted_ids.len());
                    for k in r.inserted_ids.keys() {
                        ordered_keys.push(*k);
                    }
                    ordered_keys.sort();
                    let mut ret = Vec::with_capacity(r.inserted_ids.len());
                    for k in ordered_keys {
                        let v = r.inserted_ids.remove(&k).unwrap();
                        ret.push(bson::from_document(doc! {"_id": v}).unwrap())
                    }

                    InterpreterType::Array(ret)
                },
                Err(e) => panic!("Failure inserting {}", e)
            }
        },
        _ => match collection.insert_one(bson::to_document(instance).unwrap(), None).await {
            Ok(r) => bson::from_document(doc! {"_id": r.inserted_id}).unwrap(),
            Err(e) => panic!("Failure inserting {}", e)
        }
    }

}
pub(crate) async fn getAll(db: &Database, storeName: &str, schema: &Schema) -> InterpreterType {
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
}

pub(crate) async fn query(db: &Database, storeName: &str, project: &HashMap<String, InterpreterType>) -> InterpreterType {
    let collection = db.collection(&storeName);

    let options = FindOptions::builder().projection(Some(bson::to_document(project).unwrap())).build();
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
}

pub(crate) async fn find_one(db: &Database, storeName: &str, query_doc: &InterpreterType, project: &HashMap<String, InterpreterType>) -> InterpreterType {
    
    let collection = db.collection(&storeName);
    let options = FindOneOptions::builder().projection(Some(bson::to_document(project).unwrap())).build();

    match collection.find_one(bson::to_document(query_doc).unwrap(), options).await {
        Ok(r) => match r {
            Some(o) => bson::from_document(o).unwrap(),
            None => InterpreterType::None
        },
        Err(e) => {
            eprintln!("Could not dereference pointer: {}", e);
            InterpreterType::None
        }
    }
}

pub(crate) async fn delete_one(db: &Database, storeName: &str, query_doc: &InterpreterType) -> InterpreterType {
    let collection = db.collection(&storeName);
    let d = match collection.delete_one(bson::to_document(query_doc).unwrap(), None).await {
        Ok(result) => result.deleted_count == 1,
        Err(e) => {
            eprintln!("Failure deleting: {}", e);
            false
        }
    };
    InterpreterType::bool(d)
}

pub(crate) async fn measure(db: &Database, storeName: &str) -> InterpreterType {
    let collection = db.collection(&storeName);
    let d = match collection.estimated_document_count(None).await {
        Ok(count) => count,
        Err(e) => {
            eprintln!("Failure measuring: {}", e);
            0
        }
    };
    InterpreterType::int(d)
}

pub(crate) async fn find_and_update_one(db: &Database, storeName: &str, query_doc: &InterpreterType, update_doc: &InterpreterType) -> InterpreterType {
    let collection = db.collection(&storeName);
    
    match collection.find_one_and_update(
        bson::to_document(&query_doc).unwrap(), 
        mongodb::options::UpdateModifications::Document(bson::to_document(&update_doc).unwrap()), 
        Some(FindOneAndUpdateOptions::builder().return_document(Some(options::ReturnDocument::After)).build())).await {
            Ok(r) => match r {
                Some(r) => bson::from_document(r).unwrap(),
                None => InterpreterType::None
            },
            Err(e) => {
                eprintln!("Failure updating: {}", e);
                InterpreterType::None
            }
    }
}