import gulp from 'gulp'
import mocha from 'gulp-mocha'
import runSequence from 'run-sequence'
import eslint from 'gulp-eslint'
import sourcemaps from 'gulp-sourcemaps'
import babel from 'gulp-babel'

gulp.task('eslint', () => {
  return gulp.src([
    'gulpfile.babel.js',
    'src/**/*.js',
  ])
  .pipe(eslint())
  .pipe(eslint.format())
  .pipe(eslint.failAfterError())
})

gulp.task('end', () => {
  process.exit()
})

gulp.task('_test', () => {
  return gulp.src('src/test/*.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha({reporter: 'nyan'}))
})

gulp.task('test', (done) => runSequence('_test', 'end', done))

gulp.task('build', function() {
  return gulp.src('src/**/*.js')
    .pipe(sourcemaps.init())
    .pipe(babel({stage: 0}))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('dist'))
})
