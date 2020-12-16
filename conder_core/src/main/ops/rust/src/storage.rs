// Copyright (C) 2020 Conder Systems

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

use mongodb::{Database, options, options::{ClientOptions, FindOptions, FindOneOptions, InsertManyOptions, FindOneAndUpdateOptions, ReplaceOptions}, bson, bson::{doc}, results, Client};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use futures::stream::StreamExt;

use crate::{InterpreterType, Schema};

trait bsonable {
    fn to_doc(&self) -> Result<bson::Document, String>;
}
impl bsonable for InterpreterType {
    fn to_doc(&self) ->  Result<bson::Document, String> {
        match bson::to_document(self) {
            Ok(d) => Ok(d),
            Err(e) => Err(format!("Could not produce bson: {}", e))
        }
    }
}

trait unbsonable {
    fn from_doc(self) -> Result<InterpreterType, String>;
}
impl unbsonable for bson::Document {
    fn from_doc(self) -> Result<InterpreterType, String> {
        match bson::from_document(self) {
            Ok(d) => Ok(d),
            Err(e) => Err(format!("Could not convert from doc {}", e))
        }
    }
}


pub(crate) async fn append(db: &Database, storeName: &str, instance: &InterpreterType) -> Result<InterpreterType, String> {
    let collection = db.collection(&storeName);
    match instance { 
        InterpreterType::Array(v) => {
            let mut bs: Vec<bson::Document> = Vec::with_capacity(v.len());
            for entry in v {
                bs.push(entry.to_doc()?);
            }
            
            match collection.insert_many(bs, None).await {
                Ok(_) => Ok(InterpreterType::None),
                Err(e) => Err(format!("Failure inserting {}", e))
            }
        },
        _ => match collection.insert_one(instance.to_doc()?, None).await {
            Ok(_) => Ok(InterpreterType::None),
            Err(e) => Err(format!("Failure inserting {}", e)) 
        }
    }

}


impl bsonable for HashMap<String, InterpreterType>  {
    fn to_doc(&self) ->  Result<bson::Document, String> {
        match bson::to_document(self) {
            Ok(d) => Ok(d),
            Err(e) => Err(format!("Could not produce bson: {}", e))
        }
    }
}

pub(crate) async fn replace_one(db: &Database, storeName: &str, instance: &HashMap<String, InterpreterType>, filter: &HashMap<String, InterpreterType>, upsert: bool) -> Result<bool, String> {         
    let collection = db.collection(&storeName);
    match collection.replace_one(
        filter.to_doc()?,
        instance.to_doc()?,
        Some(ReplaceOptions::builder().upsert(upsert).build())
    ).await {
        Ok(r) => Ok(r.modified_count > 0),
        Err(e) => Err(format!("Failure inserting {}", e))
    }
}


pub(crate) async fn query(db: &Database, storeName: &str, project: &HashMap<String, InterpreterType>, filter: &HashMap<String, InterpreterType>) -> Result<InterpreterType, String> {
    let collection = db.collection(&storeName);
    let mut projection = project.to_doc()?;
    projection.insert("_id", false);
    let options = FindOptions::builder().projection(Some(projection)).build();

    let mut res = match collection.find(filter.to_doc()?, options).await {
        Ok(c) => c,
        Err(e) => return Err(format!("Failure: {}", e))
    };

    let mut ret = vec![];
    while let Some(v) = res.next().await {
        match v {
            Ok(doc) => ret.push(doc.from_doc()?),
            Err(e) => return Err(format!("Could not produce valid type: {}", e))
        };
    }
    
    return Ok(InterpreterType::Array(ret))
}

pub(crate) async fn find_one(db: &Database, storeName: &str, project: &HashMap<String, InterpreterType>, filter: &HashMap<String, InterpreterType>) -> Result<InterpreterType, String> {
    
    let collection = db.collection(&storeName);
    let mut projection = project.to_doc()?;
    projection.insert("_id", false);
    let options = FindOneOptions::builder().projection(Some(projection)).build();

    match collection.find_one(filter.to_doc()?, options).await {
        Ok(r) => match r {
            Some(o) => o.from_doc(),
            None => Ok(InterpreterType::None)
        },
        Err(e) => {
            eprintln!("Did not find matching doc with error: {}", e);
            Ok(InterpreterType::None)
        }
    }
}

pub(crate) async fn delete_one(db: &Database, storeName: &str, query_doc: &InterpreterType) -> Result<InterpreterType, String> {
    let collection = db.collection(&storeName);
    let d = match collection.delete_one(query_doc.to_doc()?, None).await {
        Ok(result) => result.deleted_count == 1,
        Err(e) => {
            eprintln!("Failure deleting: {}", e);
            false
        }
    };
    Ok(InterpreterType::bool(d))
}

pub(crate) async fn measure(db: &Database, storeName: &str, filter: &HashMap<String, InterpreterType>) -> Result<InterpreterType, String> {
    let collection = db.collection(&storeName);
    let d = match collection.count_documents(filter.to_doc()?, None).await {
        Ok(count) => count,
        Err(e) => {
            eprintln!("Failure measuring: {}", e);
            0
        }
    };
    Ok(InterpreterType::int(d))
}

pub(crate) async fn find_and_update_one(db: &Database, storeName: &str, upsert: bool, query_doc: &InterpreterType, update_doc: &InterpreterType) -> Result<InterpreterType, String> {
    let collection = db.collection(&storeName);
    let options = FindOneAndUpdateOptions::builder()
        .return_document(Some(options::ReturnDocument::After))
        .projection(Some(doc! {"_id": false}))
        .upsert(Some(upsert))
        .build();
    match collection.find_one_and_update(
        query_doc.to_doc()?, 
        mongodb::options::UpdateModifications::Document(update_doc.to_doc()?), 
        Some(options)).await {
            Ok(r) => match r {
                Some(r) => r.from_doc(),
                None => Ok(InterpreterType::None)
            },
            Err(e) => {
                eprintln!("Failure updating: {}", e);
                eprintln!("{:?}", update_doc);
                Ok(InterpreterType::None)
            }
    }
}