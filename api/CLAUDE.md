# API Conventions

## No .lean() or .select()

NEVER use `.lean()` or `.select()` on Mongoose queries. Always return full documents.

```js
// GOOD
const team = await Team.findById(id);

// BAD - never do this
const team = await Team.findById(id).lean();
const team = await Team.findById(id).select("name league");
```

## No else

NEVER use `else` or `else if`. Use early returns, guard clauses, or separate `if` statements instead.

```js
// BAD
if (operator === '>') success = current > value;
else if (operator === '>=') success = current >= value;
else if (operator === '<') success = current < value;

// GOOD
if (operator === '>') return current > value;
if (operator === '>=') return current >= value;
if (operator === '<') return current < value;
```

## No Unnecessary Variables

NEVER create intermediate `const` variables for simple derived values. Inline them directly in the JS.

```jsx
// BAD
const score = avg.toFixed(1);
const color = avg >= 7 ? "text-emerald-400" : "text-red-400";
return <span className={color}>{score}</span>;

// GOOD
return <span className={avg >= 7 ? "text-emerald-400" : "text-red-400"}>{avg.toFixed(1)}</span>;
```
