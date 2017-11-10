//Javascript application to set up a node server to handle FDR calculation requests.
//When a request is made to the server, it parses the URL to get the target FDR and a
//timestamp that uniquely identifies the set of records to be fetched. Then, it calculates
//the MOWSE score threshold that will ensure that the FDR of the remaining data will
//be <= the target FDR.
//To run: node fdr_js_jmb.js [host] [database] [user] [user password] [listenPort]
//URL example: http://proteome.biomed.brown.edu:8000/?&fdr=0.01&timestamp=63645930957268

var http = require('http');
var url = require('url');
var mysql = require('mysql');

var cmdArgs = process.argv.slice(2);

host = cmdArgs[0]; // e.g. 'proteome.salomon.brown.edu'
database = cmdArgs[1]; // e.g. 'sequest'
user = cmdArgs[2]; // e.g. 'JSClient'
password = cmdArgs[3]; // e.g. 'niceTry'
listenPort = cmdArgs[4]; // e.g. 8000

function getSum(total, num) {
    return total + num;
}
// Connect to MySQL database 
var con = mysql.createConnection({
	host: host,
	user: user,
	password: password,
	database: database
});

//Create a simple HTTP server to host the threshold online
var server = http.createServer(function (request, response) {
	//Query data holds the information parsed from the URL
	var queryData = url.parse(request.url, true).query;
	//Query: Select score and the db direction from all records with the queried timestamp
	var sqlQuery = mysql.format('SELECT score, db_direction FROM current_foundset_shadowtable WHERE timestamp =? ORDER BY score ASC', [queryData.timestamp]);
	//Now execute the query
	con.query(sqlQuery, function(err, rows, fields)
	{
		if(err != null){
			console.log('MySQL query error: ' + err);
		}
		console.log('Number of records retrieved is ' + rows.length);
		response.writeHead(200, { 'Content-Type': 'application/json'});
		var numRecords = rows.length;
		var scores = [numRecords]; //Where we will store scores for each record
		var dbDirections = [numRecords]; //Where we will store the DB direction for each record
		//Loop through each record and build up scores and db_directions

		for (var i = 0; i < rows.length; i++){
			scores[i] = rows[i].score;
			if (rows[i].db_direction == 1 || rows[i].db_direction == 'F') {
				dbDirections[i] = 0;
			}
			else {
				dbDirections[i] = 1;
			}
		}

		total = totalRec = scores.length;
		totalR = dbDirections.reduce(getSum);
		totalFInp = total - totalR;
		arr1 = [queryData.fdr];
		console.log('target FDR is ' + arr1[0]);

		//Calculate the MOWSE threshold that hits the target FDR
		var j = 0;
		var currThreshold = 0;
		var sTable = [[],[]];
		
		for(var i = 0; i < total; i++){
			var totalF = totalRec - totalR;
			var currFDR = totalR / totalF;
			
			for (var k = j; k < arr1.length; k++){
				if (arr1[k] < currFDR) {
					break;
				}
				else{
					//column indices in sTable:
					//FDR = 0 threshold = 1 realFDR = 2 yield = 3 percent = 4
					sTable[j][0] = (arr1[k] *100).toFixed(1) + '%'; //Convert to string with 1 decimal place
					sTable[j][1] = (Math.ceil(currThreshold * 10000) /10000).toFixed(4);
					sTable[j][2] = (currFDR * 100).toFixed(2) + '%';
					sTable[j][3] = totalF + '/' + totalFInp;
					sTable[j][4] = (totalF/totalFInp * 100).toFixed(1) + '%';
					j += 1;
				}
			}
			currThreshold = scores[i];
			totalRec -= 1;
			if (dbDirections[i] == 1){
				totalR -= 1
			}
		}
		//If sTable's threshold column in the first row is the empty string '', then return 1. 
		//Else, return the calculated threshold. We do this by calling response.end, which 
		//sends a signal to the webpage with the given number
		if(sTable[0][1] == '') {
			response.end(1);
		}
		else{
			console.log('MOWSE threshold is ' + sTable[0][1]);
			console.log('--------------------------------------');
			response.end(sTable[0][1]);
		}
		});
});

// Start server listening for FDR jobs on port 8000, IP defaults to 1
console.log('Proteome is listening on Port 8000');
server.listen(8000, 'proteome.biomed.brown.edu');