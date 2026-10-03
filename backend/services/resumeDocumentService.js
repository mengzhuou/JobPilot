const { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } = require('docx');
// Single column, real text, no tables/text boxes or graphics. Original visual layout is not retained.
const createResumeDocument = text => {
    const lines=text.replace(/\r/g,'').split('\n');
    const children=lines.map((line,index)=> {
        const heading=/^(summary|profile|professional summary|(?:work |professional |relevant )?experience|employment|education|(?:technical |core )?skills|projects|certifications|awards|publications|volunteer experience)\s*:?$/i.test(line.trim());
        const bullet=/^\s*[•●▪*-]\s+/.test(line);
        return new Paragraph({
            children:[new TextRun({text:bullet?line.replace(/^\s*[•●▪*-]\s+/,''):line,bold:index===0||heading,size:index===0?40:heading?22:21,color:heading?'243A59':'202733'})],
            ...(index===0||index===1&&/@|linkedin|github|\d{3}[-.)\s]/i.test(line)?{alignment:AlignmentType.CENTER}:{}),
            ...(heading?{border:{bottom:{style:BorderStyle.SINGLE,size:4,color:'9CAABB',space:4}}}:{}),
            ...(bullet?{bullet:{level:0}}:{}),
            spacing:{after:line.trim()?75:40,before:heading?150:0},
            keepNext:index===0||heading,
        });
    });
    return Packer.toBuffer(new Document({creator:'JobPilot',title:'Tailored resume',styles:{default:{document:{run:{font:'Calibri',size:21},paragraph:{spacing:{line:260}}}}},
        sections:[{properties:{page:{margin:{top:720,right:850,bottom:720,left:850}}},children}]}));
};
module.exports={createResumeDocument};
