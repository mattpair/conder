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
        loop {
            let next_kr = KeyRange::key(self.lock_name());
            let initalize = PutRequest::new(self.lock_name(), vec![]);
            let txn = TxnRequest::new()
            .when_version(next_kr, TxnCmp::Equal, 0)
            .and_then(PutRequest::new(self.lock_name(), "held"));
            
            let grab_open_mutex: TxnResponse = client.kv().txn(txn).await?;
            if grab_open_mutex.is_success() {
                return Ok(());
            }
        }
    }


    pub async fn release(& self, client: & Client) -> Result<()> {
        
        let release = DeleteRequest::new(KeyRange::key(self.lock_name()));
        client.kv().delete(release).await?;
        Ok(())
    }
}

