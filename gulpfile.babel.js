import gulp from 'gulp'
import mocha from 'gulp-mocha'
import runSequence from 'run-sequence'
import eslint from 'gulp-eslint'

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
  return gulp.src('src/test/randomized_runner.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha({reporter: 'nyan'}))
})

gulp.task('test', (done) => runSequence('_test', 'end', done))
