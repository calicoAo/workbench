import {createServer} from 'node:http';
let calls=0;const cover='https://covers.openlibrary.org/b/id/42-L.jpg';
createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/health'){res.end(JSON.stringify({calls}));return;}let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);calls++;
if(req.url==='/v1/tools/search')res.end(JSON.stringify({results:[{title:'作品资料出处',url:'https://publisher.example/books/qa-hobbit',content:`《霍比特人》，托尔金，1937年出版。一个小人物的奇幻旅程。 ![封面](${cover})`}]}));
else if(req.url==='/responses'&&body.text.format.name==='library_media_candidates_v2')res.end(JSON.stringify({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({candidates:[{title:'霍比特人',originalTitle:'The Hobbit',creator:'托尔金',releaseYear:1937,description:'一个小人物的奇幻旅程。',sourceIndexes:[0],coverRef:cover}]})}]}],usage:{input_tokens:300,output_tokens:100,output_tokens_details:{reasoning_tokens:0}}}));
else {res.statusCode=500;res.end('{}');}}).listen(33308,'127.0.0.1',()=>console.log('isolated provider fixture on 33308'));
