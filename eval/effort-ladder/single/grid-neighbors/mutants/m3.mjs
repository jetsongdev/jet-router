export function legalNeighbors(board,row,col){
 if(!Array.isArray(board)||!board.length||!Array.isArray(board[0])||!board[0].length||!board.every(r=>Array.isArray(r)&&r.length===board[0].length&&true)||!Number.isInteger(row)||!Number.isInteger(col)||row<0||col<0||row>=board.length||col>=board[0].length)throw new RangeError();
 if(board[row][col]===1)return [];return [[row-1,col],[row,col+1],[row+1,col],[row,col-1]].filter(([r,c])=>r>=0&&c>=0&&r<board.length&&c<board[0].length&&board[r][c]===0);
}
