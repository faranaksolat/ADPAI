// OCR can insert spaces between Korean syllables. Tolerate only whitespace,
// never substitute letters, and retain offsets/confidence in the source text.
const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const hangul=s=>/[\uac00-\ud7a3]/u.test(s||'');
export function labelPattern(term,transform=s=>s) {
  const chars=[...String(term).normalize('NFC')];
  let out='';
  for(let i=0;i<chars.length;i++) {
    if(/\s/u.test(chars[i])) {
      const previous=chars[i-1];while(i+1<chars.length&&/\s/u.test(chars[i+1]))i++;
      out+=hangul(previous)&&hangul(chars[i+1])?'\\s*':'\\s+';
    } else {
      out+=escape(transform(chars[i]));
      if(hangul(chars[i])&&hangul(chars[i+1]))out+='\\s*';
    }
  }
  return out;
}
