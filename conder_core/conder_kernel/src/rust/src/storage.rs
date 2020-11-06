
use mongodb::{Database, options, options::{ClientOptions, FindOptions, FindOneOptions, InsertManyOptions, FindOneAndUpdateOptions, ReplaceOptions}, bson, bson::{doc}, results, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use futures::stream::StreamExt;

use crate::{InterpreterType, Schema};

pub(crate) async fn append(db: &Database, storeName: &str, instance: &InterpreterType) -> InterpreterType {         
    let collection = db.collection(&storeName);
    match instance { 
        InterpreterType::Array(v) => {
            let bs: Vec<bson::Document> = v.into_iter().map(|i| bson::to_document(i).unwrap()).collect();
            match collection.insert_many(bs, None).await {
                Ok(_) => InterpreterType::None,
                Err(e) => panic!("Failure inserting {}", e)
            }
        },
        _ => match collection.insert_one(bson::to_document(instance).unwrap(), None).await {
            Ok(_) => InterpreterType::None,
            Err(e) => panic!("Failure inserting {}", e)
        }
    }

}

pub(crate) async fn replace_one(db: &Database, storeName: &str, instance: &HashMap<String, InterpreterType>, filter: &HashMap<String, InterpreterType>, upsert: bool) -> bool {         
    let collection = db.collection(&storeName);
    match collection.replace_one(
        bson::to_document(filter).unwrap(), 
        bson::to_document(instance).unwrap(), 
        Some(ReplaceOptions::builder().upsert(upsert).build())
    ).await {
        Ok(r) => r.modified_count > 0,
        Err(e) => panic!("Failure inserting {}", e)
    }
}


pub(crate) async fn query(db: &Database, storeName: &str, project: &HashMap<String, InterpreterType>, filter: &HashMap<String, InterpreterType>) -> InterpreterType {
    let collection = db.collection(&storeName);
    let mut projection = bson::to_document(project).unwrap();
    projection.insert("_id", false);
    let options = FindOptions::builder().projection(Some(projection)).build();

    let mut res = match collection.find(bson::to_document(filter).unwrap(), options).await {
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

pub(crate) async fn find_one(db: &Database, storeName: &str, project: &HashMap<String, InterpreterType>, filter: &HashMap<String, InterpreterType>) -> InterpreterType {
    
    let collection = db.collection(&storeName);
    let mut projection = bson::to_document(project).unwrap();
    projection.insert("_id", false);
    let options = FindOneOptions::builder().projection(Some(projection)).build();

    match collection.find_one(bson::to_document(filter).unwrap(), options).await {
        Ok(r) => match r {
            Some(o) => bson::from_document(o).unwrap(),
            None => InterpreterType::None
        },
        Err(e) => {
            eprintln!("Did not find matching doc with error: {}", e);
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

pub(crate) async fn measure(db: &Database, storeName: &str, filter: &HashMap<String, InterpreterType>) -> InterpreterType {
    let collection = db.collection(&storeName);
    let d = match collection.count_documents(bson::to_document(filter).unwrap(), None).await {
        Ok(count) => count,
        Err(e) => {
            eprintln!("Failure measuring: {}", e);
            0
        }
    };
    InterpreterType::int(d)
}

pub(crate) async fn find_and_update_one(db: &Database, storeName: &str, upsert: bool, query_doc: &InterpreterType, update_doc: &InterpreterType) -> InterpreterType {
    let collection = db.collection(&storeName);
    let options = FindOneAndUpdateOptions::builder()
        .return_document(Some(options::ReturnDocument::After))
        .projection(Some(doc! {"_id": false}))
        .upsert(Some(upsert))
        .build();
    match collection.find_one_and_update(
        bson::to_document(&query_doc).unwrap(), 
        mongodb::options::UpdateModifications::Document(bson::to_document(&update_doc).unwrap()), 
        Some(options)).await {
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