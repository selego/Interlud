# Frontend Conventions

## API Fetch Pattern

ALWAYS use this exact pattern for API calls:

```jsx
const fetchIndicators = async () => {
  try {
    const { ok, data, code } = await api.post("/indicator/search", { action_id: action?._id })
    if (!ok) return toast.error(code || "Failed to fetch indicators")
    setIndicators(data)
  } catch (error) {
    toast.error(error.code || "Failed to fetch indicators")
  }
}

useEffect(() => {
  fetchIndicators()
}, [])
```

Rules:

- ALWAYS use `api.post` or `api.get` from `services/api.js` (NEVER use fetch/axios directly)
- ALWAYS destructure `{ ok, data, code }` from the response
- ALWAYS handle errors with `toast.error` using `code` as the message
- ALWAYS wrap in try/catch
- ALWAYS define fetch functions outside of `useEffect`, then call them inside

## State Management for Fetched Objects

When fetching an object (e.g. an action, a collectivity), ALWAYS store it as a single state object. For PUT/update requests, send the entire object directly.

```jsx
const [action, setAction] = useState(null)

// update a field
onChange={e => setAction(prev => ({ ...prev, name: e.target.value }))}

// send the whole object
await api.put(`/action/${id}`, action)
```

NEVER create separate useState for each field. NEVER split a fetched object into multiple setState calls (e.g. `setCompletionInit(data.completion_init)` + `setCompletionRef(data.completion_ref)`) — store the whole object in one `setData(data)` and access fields via dot notation. NEVER create a helper like `setField`. NEVER list fields individually in PUT requests.

## No Promise.all

NEVER use `Promise.all` to parallelize API calls. Always call fetches sequentially, one after another.

## Data Fetching Rules

Every component is responsible for fetching the data it needs. Exception: if the same fetch is used by multiple route siblings (e.g. List and View), move it to the parent `index.jsx` and pass as prop.

```jsx
// index.jsx — shared fetch between siblings
export default function Index() {
  const [stats, setStats] = useState([])
  // fetch here...
  return (
    <Routes>
      <Route path="/" element={<List stats={stats} />} />
      <Route path="/:id" element={<View stats={stats} />} />
    </Routes>
  )
}
```

NEVER fetch inside another fetch in the same component. If you need child data from a parent list, create a child component that fetches its own data by ID.

NEVER have multiple fetches in a single component. If a component needs data from two different endpoints, split it into separate child components, each responsible for its own fetch.

## Props Convention

ALWAYS pass the full `data` object as prop to child components. NEVER destructure or cherry-pick individual fields as props (e.g. `actionId={data.action._id}`). The child accesses what it needs via dot notation.

```jsx
// BAD
<IndicatorList actionId={data.action._id} />

// GOOD
<IndicatorList data={data} />
```

## No Unnecessary Variables

NEVER create intermediate `const` variables for simple derived values. Inline them directly in the JSX.

```jsx
// BAD
const score = avg.toFixed(1)
const color = avg >= 7 ? "text-emerald-400" : "text-red-400"
return <span className={color}>{score}</span>

// GOOD
return <span className={avg >= 7 ? "text-emerald-400" : "text-red-400"}>{avg.toFixed(1)}</span>
```

## No Object Destructuring

NEVER destructure objects into intermediate variables. Access properties directly with dot notation.

```jsx
// BAD
const { in_progress, completed } = stats
return (
  <span>
    {in_progress} en cours, {completed} terminées
  </span>
)

// GOOD
return (
  <span>
    {stats.in_progress} en cours, {stats.completed} terminées
  </span>
)
```

Exception: destructuring API responses (`{ ok, data, code }`) and `useStore()` is allowed.

## Backend Filtering

ALWAYS filter data on the backend. NEVER filter on the frontend with `useMemo`, `.filter()`, or any client-side logic on fetched arrays.

Store filters in a single `useState` object and spread them directly into the `api.post` body. The `useEffect` re-fetches whenever `filters` changes.

```jsx
const [filters, setFilters] = useState({ search: "", situation: "", owner: "" })

const fetchActions = async () => {
  try {
    const { ok, data, code } = await api.post("/action/search", { collectivity_id: collectivity?._id, ...filters })
    if (!ok) return toast.error(code || "Failed to fetch actions")
    setActions(data)
  } catch (error) {
    toast.error(error.code || "Failed to fetch actions")
  }
}

useEffect(() => {
  fetchActions()
}, [filters])
```

Rules:

- ALWAYS store all filters in a single `useState` object, NEVER one `useState` per filter
- ALWAYS spread `...filters` directly in the `api.post` call, NEVER build a separate `body` variable
- ALWAYS re-fetch via `useEffect` on `[filters]`, the backend handles empty/falsy filter values
- Filter dropdowns (situation, owner, etc.) are self-contained components that fetch their own options

## No External Body Variable

NEVER create an intermediate `body` or `payload` variable for `api.post`. Pass the object inline.

```jsx
// BAD
const body = { collectivity_id: collectivity?._id }
if (filters.search) body.search = filters.search
const { ok, data, code } = await api.post("/endpoint", body)

// GOOD
const { ok, data, code } = await api.post("/endpoint", { collectivity_id: collectivity?._id, ...filters })
```
