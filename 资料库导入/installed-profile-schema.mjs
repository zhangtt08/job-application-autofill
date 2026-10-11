// src/types/profile.ts
var EMPTY_VARIANTS = {
  agent: "",
  aiApplication: "",
  aiProduct: "",
  aiOperation: "",
  aiSolution: "",
  aigcMarketing: ""
};
var EXPERIENCE_VARIANT_KEYS = Object.keys(EMPTY_VARIANTS);
var YES_NO_PREFERENCE_KEYS = [
  "acceptOfflineInterview",
  "acceptOnlineInterview",
  "acceptBusinessTrip",
  "acceptRelocation",
  "acceptOvertime"
];

// src/profile/installed-profile-schema.ts
function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
var BASIC_KEYS = [
  "name",
  "englishName",
  "surname",
  "givenName",
  "linkedin",
  "github",
  "gender",
  "birthDate",
  "age",
  "phone",
  "email",
  "wechat",
  "qq",
  "city",
  "portfolio",
  "address",
  "idNumber",
  "nativePlace",
  "hukou",
  "hukouType",
  "politicalStatus",
  "maritalStatus",
  "height",
  "weight",
  "workYears",
  "emergencyContactName",
  "emergencyContactPhone"
];
var BASIC_KEYS_OPTIONAL = /* @__PURE__ */ new Set([
  "age",
  "qq",
  "portfolio",
  "address",
  "idNumber",
  "nativePlace",
  "hukou",
  "hukouType",
  "politicalStatus",
  "maritalStatus",
  "height",
  "weight",
  "workYears",
  "emergencyContactName",
  "emergencyContactPhone",
  "surname",
  "givenName",
  "linkedin",
  "github"
]);
function checkBasic(v, errors) {
  const out = {};
  if (!isRecord(v)) {
    errors.push("basic \u5FC5\u987B\u662F\u5BF9\u8C61");
    return out;
  }
  for (const key of BASIC_KEYS) {
    const val = v[key];
    if (typeof val === "string") {
      out[key] = val;
    } else if (val === void 0 && BASIC_KEYS_OPTIONAL.has(key)) {
      out[key] = "";
    } else {
      errors.push(`basic.${key} \u5FC5\u987B\u662F string\uFF0C\u5B9E\u9645\u4E3A ${val === void 0 ? "\u7F3A\u5931" : typeof val}`);
    }
  }
  return out;
}
function checkLongTextBlock(v, name, errors, optional = false) {
  const out = { short: "", medium: "", long: "" };
  if (v === void 0 && optional) return out;
  if (!isRecord(v)) {
    errors.push(`${name} \u5FC5\u987B\u662F\u5BF9\u8C61`);
    return out;
  }
  for (const key of ["short", "medium", "long"]) {
    const val = v[key];
    if (typeof val === "string") out[key] = val;
    else if (val === void 0 && optional) out[key] = "";
    else errors.push(`${name}.${key} \u5FC5\u987B\u662F string`);
  }
  return out;
}
function checkStringArray(v, name, errors, optional = false) {
  if (v === void 0 && optional) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    errors.push(`${name} \u5FC5\u987B\u662F string[]`);
    return [];
  }
  return v;
}
function checkEducation(v, errors) {
  if (!Array.isArray(v)) {
    errors.push("education \u5FC5\u987B\u662F\u6570\u7EC4");
    return [];
  }
  return v.map((item, i) => {
    if (!isRecord(item)) {
      errors.push(`education[${i}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
      return null;
    }
    const keys = [
      "school",
      "college",
      "major",
      "degree",
      "educationLevel",
      "startDate",
      "endDate",
      "gpa",
      "rank"
    ];
    for (const k of keys) {
      if (typeof item[k] !== "string") errors.push(`education[${i}].${k} \u5FC5\u987B\u662F string`);
    }
    for (const k of ["degreeType", "direction"]) {
      if (item[k] === void 0) item[k] = "";
      else if (typeof item[k] !== "string") errors.push(`education[${i}].${k} \u5FC5\u987B\u662F string`);
    }
    return item;
  });
}
var EXPERIENCE_KEYS_OPTIONAL = ["responsibilities", "workContent", "achievements", "summary", "background"];
function normalizeVariants(item, name, i, errors) {
  const val = item.variants;
  if (val === void 0) {
    item.variants = { agent: "", aiApplication: "", aiProduct: "", aiOperation: "", aiSolution: "", aigcMarketing: "" };
    return;
  }
  if (!isRecord(val)) {
    errors.push(`${name}[${i}].variants \u5FC5\u987B\u662F\u5BF9\u8C61`);
    item.variants = { agent: "", aiApplication: "", aiProduct: "", aiOperation: "", aiSolution: "", aigcMarketing: "" };
    return;
  }
  const out = {};
  for (const k of ["agent", "aiApplication", "aiProduct", "aiOperation", "aiSolution", "aigcMarketing"]) {
    const v = val[k];
    if (typeof v === "string") out[k] = v;
    else if (v === void 0) out[k] = "";
    else errors.push(`${name}[${i}].variants.${k} \u5FC5\u987B\u662F string`);
  }
  item.variants = out;
}
function checkExperienceEntries(v, name, errors, keys) {
  if (!Array.isArray(v)) {
    errors.push(`${name} \u5FC5\u987B\u662F\u6570\u7EC4`);
    return [];
  }
  return v.map((item, i) => {
    if (!isRecord(item)) {
      errors.push(`${name}[${i}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
      return null;
    }
    for (const k of keys) {
      if (typeof item[k] !== "string") errors.push(`${name}[${i}].${k} \u5FC5\u987B\u662F string`);
    }
    for (const k of EXPERIENCE_KEYS_OPTIONAL) {
      const val = item[k];
      if (val === void 0) item[k] = "";
      else if (typeof val !== "string") errors.push(`${name}[${i}].${k} \u5FC5\u987B\u662F string`);
    }
    normalizeVariants(item, name, i, errors);
    return item;
  });
}
var EXPERIENCE_KEYS = [
  "descriptionShort",
  "descriptionMedium",
  "descriptionLong"
];
function checkProjects(v, errors) {
  if (!Array.isArray(v)) {
    errors.push("projects \u5FC5\u987B\u662F\u6570\u7EC4");
    return [];
  }
  return v.map((item, i) => {
    if (!isRecord(item)) {
      errors.push(`projects[${i}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
      return null;
    }
    const keys = [
      "name",
      "role",
      "startDate",
      "endDate",
      "descriptionShort",
      "descriptionMedium",
      "descriptionLong"
    ];
    for (const k of keys) {
      if (typeof item[k] !== "string") errors.push(`projects[${i}].${k} \u5FC5\u987B\u662F string`);
    }
    for (const k of EXPERIENCE_KEYS_OPTIONAL) {
      const val = item[k];
      if (val === void 0) item[k] = "";
      else if (typeof val !== "string") errors.push(`projects[${i}].${k} \u5FC5\u987B\u662F string`);
    }
    normalizeVariants(item, "projects", i, errors);
    if (!Array.isArray(item.keywords)) errors.push(`projects[${i}].keywords \u5FC5\u987B\u662F\u6570\u7EC4`);
    return item;
  });
}
function validateProfile(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, errors: ["\u6839\u8282\u70B9\u5FC5\u987B\u662F\u5BF9\u8C61"] };
  const basic = checkBasic(input.basic, errors);
  const skills = input.skills;
  let skillsOut;
  if (!isRecord(skills)) {
    errors.push("skills \u5FC5\u987B\u662F\u5BF9\u8C61");
    skillsOut = { technical: [], tools: [], languages: [], certificates: [], awards: [] };
  } else {
    skillsOut = {
      technical: checkStringArray(skills.technical, "skills.technical", errors),
      tools: checkStringArray(skills.tools, "skills.tools", errors),
      languages: checkStringArray(skills.languages, "skills.languages", errors),
      certificates: checkStringArray(skills.certificates, "skills.certificates", errors),
      awards: checkStringArray(skills.awards, "skills.awards", errors, true)
      // 增量字段，可缺省
    };
  }
  const job = input.jobPreferences;
  let jobOut;
  if (!isRecord(job)) {
    errors.push("jobPreferences \u5FC5\u987B\u662F\u5BF9\u8C61");
    jobOut = {
      expectedCity: [],
      expectedPosition: [],
      expectedSalary: "",
      availableDate: "",
      employmentType: "",
      expectedIndustry: ""
    };
  } else {
    jobOut = {
      expectedCity: checkStringArray(job.expectedCity, "jobPreferences.expectedCity", errors),
      expectedPosition: checkStringArray(job.expectedPosition, "jobPreferences.expectedPosition", errors),
      expectedSalary: typeof job.expectedSalary === "string" ? job.expectedSalary : (errors.push("jobPreferences.expectedSalary \u5FC5\u987B\u662F string"), ""),
      availableDate: typeof job.availableDate === "string" ? job.availableDate : (errors.push("jobPreferences.availableDate \u5FC5\u987B\u662F string"), ""),
      employmentType: typeof job.employmentType === "string" ? job.employmentType : (errors.push("jobPreferences.employmentType \u5FC5\u987B\u662F string"), ""),
      expectedIndustry: job.expectedIndustry === void 0 ? "" : typeof job.expectedIndustry === "string" ? job.expectedIndustry : (errors.push("jobPreferences.expectedIndustry \u5FC5\u987B\u662F string"), "")
    };
    for (const key of YES_NO_PREFERENCE_KEYS) {
      const v = job[key];
      if (typeof v === "string") jobOut[key] = v;
    }
  }
  const content = input.content;
  let contentOut;
  if (!isRecord(content)) {
    errors.push("content \u5FC5\u987B\u662F\u5BF9\u8C61");
    contentOut = {
      selfIntroduction: { short: "", medium: "", long: "" },
      selfEvaluation: { short: "", medium: "", long: "" },
      personalAdvantages: { short: "", medium: "", long: "" },
      careerPlan: { short: "", medium: "", long: "" },
      hobbies: { short: "", medium: "", long: "" }
    };
  } else {
    contentOut = {
      selfIntroduction: checkLongTextBlock(content.selfIntroduction, "content.selfIntroduction", errors),
      selfEvaluation: checkLongTextBlock(content.selfEvaluation, "content.selfEvaluation", errors),
      personalAdvantages: checkLongTextBlock(content.personalAdvantages, "content.personalAdvantages", errors),
      careerPlan: checkLongTextBlock(content.careerPlan, "content.careerPlan", errors),
      hobbies: checkLongTextBlock(content.hobbies, "content.hobbies", errors, true)
      // 增量字段
    };
  }
  const sensitive = input.sensitive;
  let sensitiveOut;
  if (!isRecord(sensitive)) {
    errors.push("sensitive \u5FC5\u987B\u662F\u5BF9\u8C61");
    sensitiveOut = { politicalStatus: "", maritalStatus: "", idNumber: "", emergencyContact: "" };
  } else {
    sensitiveOut = { ...sensitive };
    for (const k of ["politicalStatus", "maritalStatus", "idNumber", "emergencyContact"]) {
      if (typeof sensitive[k] !== "string") errors.push(`sensitive.${k} \u5FC5\u987B\u662F string`);
    }
  }
  const education = checkEducation(input.education, errors);
  const internships = checkExperienceEntries(
    input.internships,
    "internships",
    errors,
    ["company", "department", "position", "startDate", "endDate", ...EXPERIENCE_KEYS]
  );
  const campus = input.campus === void 0 ? [] : checkExperienceEntries(
    input.campus,
    "campus",
    errors,
    ["organization", "department", "position", "startDate", "endDate", ...EXPERIENCE_KEYS]
  );
  const projects = checkProjects(input.projects, errors);
  if (errors.length > 0) return { ok: false, errors: errors.slice(0, 20) };
  const profile = {
    basic,
    education,
    internships,
    campus,
    projects,
    skills: skillsOut,
    jobPreferences: jobOut,
    content: contentOut,
    sensitive: sensitiveOut
  };
  const careerRaw = input.careerPreferences;
  if (careerRaw && typeof careerRaw === "object") {
    const c = careerRaw;
    const arr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    profile.careerPreferences = {
      targetDirections: arr(c.targetDirections),
      preferredWorkTypes: arr(c.preferredWorkTypes),
      developmentGoals: arr(c.developmentGoals)
    };
  }
  return { ok: true, profile };
}
export {
  validateProfile
};
