import { describe, it, expect } from "vitest";
import { APPRAISAL_CRITERIA, validateAppraisalScores, appraisalDetailLink } from "./appraisal-workflow";
describe("appraisal workflow rules",()=>{
  const valid = Object.fromEntries(APPRAISAL_CRITERIA.map(k=>[k,3]));
  it("requires all seven scores",()=>{expect(validateAppraisalScores(valid)).toBe(true); const {initiative,...missing}=valid; expect(validateAppraisalScores(missing)).toBe(false);});
  it("rejects scores outside 1 to 5 and fractions",()=>{for(const score of [0,6,2.5])expect(validateAppraisalScores({...valid,initiative:score})).toBe(false);});
  it("rejects extra criteria",()=>{expect(validateAppraisalScores({...valid,other:3})).toBe(false);});
  it("opens the exact monthly record",()=>{expect(appraisalDetailLink({staff_profile_id:"officer",period_year:2026,period_month:11})).toBe("/appraisals/officer/officer?year=2026&month=11");});
  it("preserves annual periods",()=>{expect(appraisalDetailLink({staff_profile_id:"officer",period_year:2025,period_month:null})).toBe("/appraisals/officer/officer?year=2025");});
});