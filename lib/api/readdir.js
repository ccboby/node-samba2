

var SMB2Forge = require('../tools/smb2-forge')
  , SMB2Request = SMB2Forge.request
  ;

/*
 * readdir
 * =======
 *
 * list the file / directory from the path provided:
 *
 *  - open the directory
 *
 *  - query directory content
 *
 *  - close the directory
 *
 */
module.exports = function(path, cb){
  var connection = this;

  // SMB2 open directory
  SMB2Request('open', {path:path}, connection, function(err, file){
    if(err) cb && cb(err);
    // SMB2 query directory
    else SMB2Request('query_directory', file, connection, function(err, files){
      if(err) cb && cb(err);
      // SMB2 close directory
      else SMB2Request('close', file, connection, function(err){
        var res = [];
        files.map(function(v){
          if(v.Filename!='.' && v.Filename!='..'){
            var str="0x";
            for(var i= v.EndofFile.length-1 ; i >=0 ;i--){
              str +=  v.EndofFile[i].toString(16);
            }
            var fileSize = parseInt(str);
            res.push({fileName:v.Filename,fileAttributes:v.FileAttributes,fileSize:fileSize})
          }
        }); // get the filename  and attr
        cb && cb(null, res);
      });
    });
  });
  
}


