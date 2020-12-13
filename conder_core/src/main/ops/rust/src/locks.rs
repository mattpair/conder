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


impl Mutex {

    fn lock_name(&self) -> String {
        format!("{}-lock", self.name)
    }

    pub async fn acquire(&self, client: & Client) -> Result<()> {
        let mut real_stream = client.watch(KeyRange::key(self.lock_name())).await;

        loop {
            let next_kr = KeyRange::key(self.lock_name());
            let initalize = PutRequest::new(self.lock_name(), vec![]);
            let txn = TxnRequest::new()
            .when_value(next_kr, TxnCmp::Equal, "free")
            .and_then(PutRequest::new(self.lock_name(), "held"));
            
            let grab_open_mutex: TxnResponse = client.kv().txn(txn).await?;
            if grab_open_mutex.is_success() {
                println!("SUccess locking");
                return Ok(());
            } else {
                while let Some(res) = real_stream.next().await {
                    println!("lock is free");
                    let mut last_was_free = false;
                    match res {
                        Ok(mut resp) => {
                            for mut event in resp.take_events() {
                                last_was_free = match event.event_type() {
                                    EventType::Put => {
                                        let mut kv: KeyValue =  event.take_kvs().unwrap();
                                        "free" == String::from_utf8(kv.take_value()).unwrap()
                                        
                                    },
                                    _ => false
                                };
                            }
                        },
                        Err(e) => {
                            eprintln!("failure watching lock: {}", e);

                        }
                    };
                    if last_was_free {
                        break;
                    } else {
                        continue;
                    }
                }
            }
        }
    }


    pub async fn release(& self, client: & Client) -> Result<()> {
        println!("releasing lock");
        
        let release = PutRequest::new(self.lock_name(), "free");
        client.kv().put(release).await?;
        Ok(())
    }
}

