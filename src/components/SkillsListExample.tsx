/**
 * Example: Simplified Skills List Component
 * This demonstrates the migration pattern from Convex to TanStack Query
 *
 * Use this as a reference for migrating other components
 */

import { useState } from 'react'
import { useSkills } from '../../hooks/useSkills'
import { useSearchSkills } from '../../hooks/useSearchSkills'

export function SkillsListExample() {
  const [searchQuery, setSearchQuery] = useState('')
  const [view, setView] = useState<'list' | 'cards'>('list')

  // Use search when query exists, otherwise use regular list
  const hasQuery = searchQuery.trim().length > 0

  const {
    data: skillsData,
    isLoading: isLoadingList,
    error: listError,
  } = useSkills({ limit: 25 })

  const {
    data: searchData,
    isLoading: isSearching,
    error: searchError,
  } = useSearchSkills(searchQuery, { limit: 25 })

  // Determine which data to show
  const isLoading = hasQuery ? isSearching : isLoadingList
  const error = hasQuery ? searchError : listError
  const items = hasQuery ? searchData?.results : skillsData?.items

  return (
    <div className="skills-container">
      {/* Search Input */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {/* View Toggle */}
      <div className="view-toggle">
        <button
          onClick={() => setView('list')}
          className={view === 'list' ? 'active' : ''}
        >
          List
        </button>
        <button
          onClick={() => setView('cards')}
          className={view === 'cards' ? 'active' : ''}
        >
          Cards
        </button>
      </div>

      {/* Loading State */}
      {isLoading && <div className="loading">Loading skills...</div>}

      {/* Error State */}
      {error && (
        <div className="error">
          Error loading skills: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {/* Results */}
      {!isLoading && !error && items && (
        <div className={`skills-${view}`}>
          {items.length === 0 ? (
            <div className="no-results">No skills found</div>
          ) : (
            items.map((item) => (
              <div key={'slug' in item ? item.slug : item.displayName} className="skill-item">
                <h3>{'displayName' in item ? item.displayName : item.displayName}</h3>
                {'summary' in item && item.summary && <p>{item.summary}</p>}
                {'score' in item && <span className="score">Score: {item.score}</span>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Pagination (if needed) */}
      {!hasQuery && skillsData?.nextCursor && (
        <button className="load-more">Load More</button>
      )}
    </div>
  )
}

/**
 * Migration Notes:
 *
 * 1. Replace Convex hooks:
 *    - useQuery(api.skills.list) → useSkills()
 *    - useAction(api.search.search) → useSearchSkills()
 *
 * 2. Handle loading states:
 *    - Convex: data === undefined means loading
 *    - TanStack: use isLoading flag
 *
 * 3. Handle errors:
 *    - Convex: errors thrown, caught by error boundary
 *    - TanStack: error object returned
 *
 * 4. Cache invalidation:
 *    - Convex: automatic via subscriptions
 *    - TanStack: manual via queryClient.invalidateQueries()
 *
 * 5. Pagination:
 *    - Convex: usePaginatedQuery with loadMore()
 *    - TanStack: use cursor from response, call useSkills with new cursor
 */
