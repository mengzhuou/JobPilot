import {withApplicationQuestions,normalizePreferredLocations,PREFERRED_LOCATION} from './profileQuestions';
test('merges both location labels without losing saved cities or splitting city commas',()=>{
    const input=[[PREFERRED_LOCATION,['Dallas, Texas, United States']],['Preferred locations',['Atlanta, GA','dallas, texas, united states']],['Seeking','Full-time']];
    const normalized=normalizePreferredLocations(input);
    expect(normalized).toEqual([[PREFERRED_LOCATION,['Dallas, Texas, United States','Atlanta, GA']],['Seeking','Full-time']]);
    expect(normalizePreferredLocations(normalized)).toEqual(normalized);
    expect(input).toHaveLength(3);
});
test('legacy-only and empty defaults produce one canonical location field',()=>{
    for(const value of ['Austin, TX',[],['Austin, TX']]){
        const rows=withApplicationQuestions('preferences',[['Preferred locations',value],[PREFERRED_LOCATION,[]]]);
        expect(rows.filter(row=>/location/i.test(row[0]))).toEqual([[PREFERRED_LOCATION,value.length?[].concat(value):[]]]);
    }
});
