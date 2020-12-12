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
use etcd_rs::*;
use std::convert::TryInto;
use tokio::stream::StreamExt;

pub struct Mutex {
    pub name: String
}

pub struct HeldMutex {
    name: String,
    token: u64,
}

impl Mutex {

    fn next_key_range(&self) -> KeyRange {
        KeyRange::key(format!("{}.next", self.name))
    }
    pub async fn acquire(&self, client: & Client) -> Result<HeldMutex> {
    
        let next_kr =self.next_key_range();
        let s_key = format!("{}.next", self.name);
        let init: u64 = 1;
        let initalize = PutRequest::new(s_key.clone(), init.to_le_bytes());
        let get_next_key = RangeRequest::new(self.next_key_range());
        let txn = TxnRequest::new()
        .when_value(next_kr, TxnCmp::Equal, vec![])
        .and_then(initalize);
        
        
        let mut grab_open_mutex: TxnResponse =  client.kv().txn(txn).await?;
        if grab_open_mutex.is_success() {
            return Ok(HeldMutex {
                name: self.name.clone(),
                token: 0
            });
        } else {
            let mut responses = grab_open_mutex.take_responses();
            let original_response = responses.first_mut().unwrap();
            let next_key_value = match original_response {
                TxnOpResponse::Range(r) => {
                    let mut kvs = r.take_kvs();
                    
                    let mut current_kv: KeyValue = kvs.swap_remove(0);
                    let mut need_to_secure_key = true;
                    let mut taking: u64 = 0; // initialized below.
                    while need_to_secure_key {
                        let val = current_kv.take_value();
                        taking = u64::from_le_bytes(val.as_slice().try_into().unwrap());
                        let setting: u64 = taking + 1;
                        let increment_next_key = PutRequest::new(s_key.clone(), setting.to_le_bytes());
                        
                        let try_set_key = TxnRequest::new()
                        .when_value(self.next_key_range(), TxnCmp::Equal, val)
                        .and_then(increment_next_key)
                        .or_else(RangeRequest::new(self.next_key_range()));
    
                        let mut next_take_attempt: TxnResponse = client.kv().txn(try_set_key).await?;
                        if next_take_attempt.is_success() {
                            need_to_secure_key = false;
                        } else {
                            let mut new_responses = next_take_attempt.take_responses();
                            current_kv = match new_responses.first_mut().unwrap() {
                                TxnOpResponse::Range(new_range) => new_range.take_kvs().swap_remove(0),
                                _ => panic!("unexpected response")
                            };
                        }
                    }
                    let ret = HeldMutex {
                        name: self.name.clone(),
                        token: taking
                    };
                    ret.block_until_held(client).await?;
                    return Ok(ret);
                },
                _ => {
                    panic!("Unexpected response type");
                }
            };
            
        }
    }
}

impl HeldMutex {
    fn block_str(&self) -> String {
        format!("{}.blocked.{}", self.name, self.token)
    }
    fn block_key(& self) -> KeyRange {
        KeyRange::key(self.block_str())
    }
    pub async fn block_until_held(& self, client: & Client) -> Result<()> {
        client.kv().put(PutRequest::new(self.block_str(), vec![0])).await?;
        let mut stream = client.watch(self.block_key()).await;
        while let Some(res) = stream.next().await {
            match res {
                Ok(mut events) => {
                    for event in events.take_events() {
                        match event.event_type() {
                            EventType::Delete => return Ok(()),
                            _ => panic!("Unexpected event")
                        };
                    }
                }
                Err(e) => println!("Lock failure: {}", e)
            }
        }
        panic!("Unexpected escape from lock");
    }

    pub async fn release(& self, client: & Client) -> Result<()> {
        let next_kr = KeyRange::key(format!("{}.next", self.name));
        
        let reset_counter = PutRequest::new(format!("{}.next", self.name), vec![]);

        let maybe_next_holder = HeldMutex {
            token: self.token + 1,
            name: self.name.clone()
        };
        let unblock_next = DeleteRequest::new(maybe_next_holder.block_key());
        
        let release = TxnRequest::new()
        .when_value(self.block_key(), TxnCmp::Equal, vec![0])
        .and_then(reset_counter) // We know we are the only holder. May as well reset the count.
        .or_else(unblock_next);

        client.kv().txn(release).await?;
        Ok(())
    }
}

