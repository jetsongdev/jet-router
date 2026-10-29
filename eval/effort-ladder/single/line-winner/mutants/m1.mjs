export function lineWinner(board,k){
 if(!Array.isArray(board)||board.length<1||board.length>12||!Array.isArray(board[0])||board[0].length<1||board[0].length>12||!board.every(r=>Array.isArray(r)&&r.length===board[0].length&&r.every(x=>x===null||x==='A'||x==='B'))||!Number.isInteger(k)||k<1||k>Math.max(board.length,board[0].length))throw new RangeError();
 const wins=new Set();for(let r=0;r<board.length;r++)for(let c=0;c<board[0].length;c++){const v=board[r][c];if(v===null)continue;for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]){let i=0;while(i<k&&r+i*dr<board.length&&c+i*dc>=0&&c+i*dc<board[0].length&&board[r+i*dr][c+i*dc]===v)i++;if(i===k)wins.add(v);}}return wins.size?[...wins][0]:null;
}
